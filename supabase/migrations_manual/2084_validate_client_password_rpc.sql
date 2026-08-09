-- SQL PARA PERMITIR LOGIN COM SENHAS DIFERENTES POR EMPRESA
-- Como o Supabase Auth usa um e-mail global, para permitir senhas diferentes
-- precisamos de uma RPC que valide a senha específica e retorne um token de acesso
-- ou utilize o fluxo de Magic Link.

CREATE OR REPLACE FUNCTION public.validate_client_password(
    p_email TEXT,
    p_company_slug TEXT,
    p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
    v_client_record RECORD;
BEGIN
    -- 1. Busca a empresa
    SELECT id INTO v_company_id FROM public.companies WHERE slug = p_company_slug;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Empresa não encontrada.');
    END IF;

    -- 2. Busca o cliente
    SELECT * INTO v_client_record 
    FROM public.clients 
    WHERE email = p_email AND company_id = v_company_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Você não possui cadastro nesta empresa.');
    END IF;

    -- 3. Valida a senha (password_hash armazena a senha em texto ou hash)
    -- Se password_hash for nulo, ele deve usar a senha global do Supabase Auth
    IF v_client_record.password_hash IS NOT NULL AND v_client_record.password_hash != p_password THEN
        RETURN json_build_object('success', false, 'error', 'Senha incorreta para esta empresa.');
    END IF;

    RETURN json_build_object('success', true, 'user_id', v_client_record.user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_client_password(TEXT, TEXT, TEXT) TO anon, authenticated;

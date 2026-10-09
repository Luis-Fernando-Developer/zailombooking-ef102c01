-- Migração para aprimorar a validação de login multi-empresa e tratar divergências de senha global
-- A RPC validará a senha específica da empresa e fornecerá o user_id para o frontend.

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
    v_global_user_id UUID;
BEGIN
    -- 1. Busca a empresa
    SELECT id INTO v_company_id FROM public.companies WHERE slug = p_company_slug;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Empresa não encontrada.');
    END IF;

    -- 2. Busca o cliente (ignora case no email)
    SELECT * INTO v_client_record 
    FROM public.clients 
    WHERE LOWER(email) = LOWER(p_email) AND company_id = v_company_id;

    IF NOT FOUND THEN
        -- Verifica se o usuário existe globalmente mas não nesta empresa
        SELECT id INTO v_global_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
        
        IF v_global_user_id IS NOT NULL THEN
             RETURN json_build_object(
                 'success', false, 
                 'error', 'Você possui conta no Zailom, mas ainda não confirmou seu vínculo com esta empresa.',
                 'needs_link', true,
                 'user_id', v_global_user_id
             );
        ELSE
             RETURN json_build_object('success', false, 'error', 'Você não possui cadastro nesta empresa. Por favor, crie uma conta primeiro.');
        END IF;
    END IF;

    -- 3. Valida a senha específica da empresa
    -- Se password_hash for nulo, significa que ele usa a senha global do Auth (legado)
    IF v_client_record.password_hash IS NOT NULL AND v_client_record.password_hash != p_password THEN
        RETURN json_build_object('success', false, 'error', 'A senha informada não corresponde à senha definida para esta empresa.');
    END IF;

    -- Se chegou aqui, a senha é válida para ESTA empresa.
    RETURN json_build_object(
        'success', true, 
        'user_id', v_client_record.user_id,
        'message', 'Senha validada com sucesso para esta empresa.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_client_password(TEXT, TEXT, TEXT) TO anon, authenticated;

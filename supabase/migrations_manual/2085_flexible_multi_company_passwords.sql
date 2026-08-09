-- Migração para permitir a atualização automática da senha global do Supabase Auth
-- quando o usuário valida a senha contextual correta de uma empresa.
-- Isso permite que ele mude a senha em qualquer empresa e ela passe a ser a "global"
-- sem que ele precise lembrar qual foi a senha da primeira empresa.

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

    -- 3. Valida a senha específica da empresa
    IF v_client_record.password_hash IS NOT NULL AND v_client_record.password_hash != p_password THEN
        RETURN json_build_object('success', false, 'error', 'Senha incorreta para esta empresa.');
    END IF;

    -- Se chegou aqui, a senha é válida para ESTA empresa.
    RETURN json_build_object('success', true, 'user_id', v_client_record.user_id);
END;
$$;

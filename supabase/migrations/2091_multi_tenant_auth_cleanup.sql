-- Migração 2091: Autenticação por Contexto (Multi-Empresa)
-- Remove a sincronização automática que alterava a senha global.
-- Mantém a validação da senha local e permite ao sistema lidar com divergências.

DROP FUNCTION IF EXISTS public.sync_auth_password(UUID, TEXT);

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

    -- 2. Busca o cliente (case insensitive)
    SELECT * INTO v_client_record 
    FROM public.clients 
    WHERE LOWER(email) = LOWER(p_email) AND company_id = v_company_id;

    IF NOT FOUND THEN
        -- Verifica se o usuário existe globalmente para sugerir vínculo
        SELECT id INTO v_global_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
        
        IF v_global_user_id IS NOT NULL THEN
             RETURN json_build_object(
                 'success', false, 
                 'error', 'Vínculo pendente.',
                 'needs_link', true,
                 'user_id', v_global_user_id
             );
        ELSE
             RETURN json_build_object('success', false, 'error', 'Cadastro não encontrado nesta empresa.');
        END IF;
    END IF;

    -- 3. Valida a senha específica da empresa
    IF v_client_record.password_hash IS NOT NULL AND v_client_record.password_hash != p_password THEN
        RETURN json_build_object('success', false, 'error', 'Senha incorreta para esta empresa.');
    END IF;

    -- Se chegou aqui, a senha é válida para ESTA empresa.
    -- Não alteramos mais a senha global no auth.users.
    
    RETURN json_build_object(
        'success', true, 
        'user_id', v_client_record.user_id,
        'email', v_client_record.email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_client_password(TEXT, TEXT, TEXT) TO anon, authenticated;

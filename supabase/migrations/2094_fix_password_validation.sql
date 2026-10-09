-- Migração 2094: Correção pgcrypto e Validação de Senha
-- Garante que pgcrypto esteja ativo e a validação de senha aceite comparação direta e hash

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Limpar versões anteriores da RPC para evitar conflitos de assinatura
DROP FUNCTION IF EXISTS public.validate_client_password(TEXT, TEXT, TEXT);

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
    v_password_matches BOOLEAN := false;
BEGIN
    -- Busca a empresa pelo slug
    SELECT id INTO v_company_id FROM public.companies WHERE slug = p_company_slug;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Empresa não encontrada.');
    END IF;

    -- Busca o vínculo do cliente com a empresa
    SELECT * INTO v_client_record 
    FROM public.clients 
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email)) AND company_id = v_company_id;

    IF NOT FOUND THEN
        -- Verifica se o usuário existe globalmente
        SELECT id INTO v_global_user_id FROM auth.users WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email));
        
        IF v_global_user_id IS NOT NULL THEN
             RETURN json_build_object(
                 'success', false, 
                 'error', 'Você já possui conta no Zailom, mas ainda não está vinculado a esta empresa.',
                 'needs_link', true,
                 'user_id', v_global_user_id
             );
        ELSE
             RETURN json_build_object('success', false, 'error', 'Cadastro não encontrado nesta empresa.');
        END IF;
    END IF;

    -- Validação da Senha Contextual
    IF v_client_record.password_hash IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Senha não definida para esta empresa.');
    END IF;

    -- Tentar comparação direta primeiro (útil se pgcrypto estava desligado no cadastro)
    IF v_client_record.password_hash = p_password THEN
        v_password_matches := true;
    ELSE
        -- Tentar comparação via crypt() se possível
        BEGIN
            IF v_client_record.password_hash = crypt(p_password, v_client_record.password_hash) THEN
                v_password_matches := true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Se pgcrypto não estiver disponível ou hash for inválido para crypt
            v_password_matches := false;
        END;
    END IF;

    IF NOT v_password_matches THEN
        RETURN json_build_object('success', false, 'error', 'E-mail ou senha incorretos para esta empresa.');
    END IF;

    -- Sucesso: Retornamos os dados para a sessão
    RETURN json_build_object(
        'success', true, 
        'user_id', v_client_record.user_id,
        'email', v_client_record.email,
        'name', v_client_record.name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_client_password(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

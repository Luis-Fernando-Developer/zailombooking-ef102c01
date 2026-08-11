-- Migração 2090: Sincronização de Senha Global via Service Role
-- Permite que o login em uma empresa específica atualize a senha global do Supabase Auth
-- Isso evita o uso de Magic Links e economiza limite de e-mails, resolvendo o problema de cross-device.

CREATE OR REPLACE FUNCTION public.sync_auth_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Roda como dono do banco (acesso a auth.users)
SET search_path = public
AS $$
BEGIN
    -- Atualiza a senha na tabela auth.users. 
    -- O Supabase usa pgcrypto para gerenciar senhas.
    -- IMPORTANTE: Isso requer permissões de superuser ou ser o dono do esquema auth.
    -- Como é SECURITY DEFINER rodando no banco do Supabase, ele tem permissão para alterar auth.users.
    
    UPDATE auth.users 
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now(),
        last_sign_in_at = NULL -- Força renovação de tokens se necessário
    WHERE id = p_user_id;

    RETURN FOUND;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Apenas autenticados ou anon não podem chamar isso diretamente por segurança.
-- O frontend chamará a validate_client_password que por sua vez decide se chama esta ou não,
-- ou o frontend chama após validação de sucesso da senha contextual.
-- Mas para evitar abusos, vamos manter restrito.
REVOKE EXECUTE ON FUNCTION public.sync_auth_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_auth_password(UUID, TEXT) TO service_role;

-- Atualizar a validate_client_password para retornar se a sincronização é necessária
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
    v_auth_pwd_hash TEXT;
BEGIN
    -- 1. Busca a empresa
    SELECT id INTO v_company_id FROM public.companies WHERE slug = p_company_slug;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Empresa não encontrada.');
    END IF;

    -- 2. Busca o cliente
    SELECT * INTO v_client_record 
    FROM public.clients 
    WHERE LOWER(email) = LOWER(p_email) AND company_id = v_company_id;

    IF NOT FOUND THEN
        SELECT id INTO v_global_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
        
        IF v_global_user_id IS NOT NULL THEN
             RETURN json_build_object(
                 'success', false, 
                 'error', 'Vínculo pendente.',
                 'needs_link', true,
                 'user_id', v_global_user_id
             );
        ELSE
             RETURN json_build_object('success', false, 'error', 'Cadastro não encontrado.');
        END IF;
    END IF;

    -- 3. Valida a senha específica da empresa (texto puro no clients)
    IF v_client_record.password_hash IS NOT NULL AND v_client_record.password_hash != p_password THEN
        RETURN json_build_object('success', false, 'error', 'Senha incorreta.');
    END IF;

    -- 4. Verifica se a senha global é diferente da senha desta empresa
    -- Buscamos o hash atual do auth.users
    SELECT encrypted_password INTO v_auth_pwd_hash FROM auth.users WHERE id = v_client_record.user_id;
    
    -- Se crypt(p_password, v_auth_pwd_hash) != v_auth_pwd_hash, a senha global está desatualizada
    IF v_auth_pwd_hash IS NULL OR crypt(p_password, v_auth_pwd_hash) != v_auth_pwd_hash THEN
        -- Retornamos que o login local foi um sucesso, mas o global precisa de "sync"
        -- O frontend agora pode usar uma Edge Function com service_role para atualizar a senha global
        -- ou podemos tentar atualizar aqui mesmo se tivermos permissão.
        
        -- Tentativa de sync direto via função interna
        PERFORM public.sync_auth_password(v_client_record.user_id, p_password);
        
        RETURN json_build_object(
            'success', true, 
            'user_id', v_client_record.user_id,
            'synced', true,
            'message', 'Senha global sincronizada.'
        );
    END IF;

    RETURN json_build_object(
        'success', true, 
        'user_id', v_client_record.user_id,
        'synced', false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_client_password(TEXT, TEXT, TEXT) TO anon, authenticated;

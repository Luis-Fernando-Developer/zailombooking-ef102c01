-- Migração 2104: Corrige set_client_password_hash para fazer INSERT OR UPDATE
-- Problema anterior: o registro em clients NÃO existe no 1º cadastro
-- (só é criado pela confirm_client_company_link, que nunca é chamada nesse fluxo)

CREATE OR REPLACE FUNCTION public.set_client_password_hash(
    p_company_slug TEXT,
    p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_existing_hash TEXT;
    v_new_hash TEXT;
BEGIN
    -- Pega o user autenticado via auth.uid() — mais confiável que current_user_email()
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'set_client_password_hash: usuário não autenticado';
        RETURN FALSE;
    END IF;

    -- Pega a empresa pelo slug
    SELECT id INTO v_company_id FROM public.companies WHERE slug = p_company_slug;
    IF NOT FOUND THEN
        RAISE NOTICE 'set_client_password_hash: empresa não encontrada: %', p_company_slug;
        RETURN FALSE;
    END IF;

    -- Verifica se já existe um password_hash no clients
    SELECT password_hash INTO v_existing_hash
    FROM public.clients
    WHERE user_id = v_user_id AND company_id = v_company_id;

    -- Se já existe hash, atualiza
    IF v_existing_hash IS NOT NULL THEN
        UPDATE public.clients
        SET password_hash = p_password,
            updated_at = now()
        WHERE user_id = v_user_id AND company_id = v_company_id;
        RAISE NOTICE 'set_client_password_hash: hash atualizado para user_id=%', v_user_id;
        RETURN TRUE;
    END IF;

    -- Se NÃO existe registro, insere o cliente com a senha
    -- Pega os dados do usuário do Auth para preencher name e email
    INSERT INTO public.clients (user_id, company_id, name, email, password_hash, created_at, updated_at)
    SELECT
        v_user_id,
        v_company_id,
        COALESCE(
            (raw_user_meta_data->>'name')::text,
            COALESCE(
                (raw_user_meta_data->>'full_name')::text,
                split_part((raw_user_meta_data->>'name')::text, ' ', 1)
            )
        ) AS name,
        email,
        p_password AS password_hash,
        now(),
        now()
    FROM auth.users
    WHERE id = v_user_id
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        updated_at = now();

    RAISE NOTICE 'set_client_password_hash: cliente inserido/atualizado para user_id=%', v_user_id;
    RETURN TRUE;

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'set_client_password_hash: erro - %', SQLERRM;
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_client_password_hash(TEXT, TEXT) TO anon, authenticated, service_role;

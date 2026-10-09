-- Migração 2103: RPC para salvar password_hash na tabela clients
-- Necessária para que validate_client_password funcione após o 1º cadastro via SetPassword

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
BEGIN
    -- Pega o user autenticado
    v_user_id := (SELECT id FROM auth.users WHERE email = public.current_user_email());
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Pega a empresa pelo slug
    SELECT id INTO v_company_id FROM public.companies WHERE slug = p_company_slug;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Atualiza o password_hash na tabela clients
    UPDATE public.clients
    SET password_hash = p_password
    WHERE user_id = v_user_id AND company_id = v_company_id;

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_client_password_hash(TEXT, TEXT) TO anon, authenticated, service_role;

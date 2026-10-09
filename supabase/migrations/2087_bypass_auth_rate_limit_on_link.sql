-- Migração para permitir o fluxo de vínculo mesmo sob rate limit do Auth
-- E garantir que a RPC get_user_id_by_email seja robusta

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Busca o ID do usuário na tabela auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = _email
    LIMIT 1;

    RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO anon, authenticated;

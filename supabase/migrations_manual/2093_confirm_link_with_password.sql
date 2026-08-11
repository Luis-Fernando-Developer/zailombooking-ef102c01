-- Migração 2093: Suporte a definição de senha na confirmação
-- Ajusta a RPC confirm_client_company_link para aceitar opcionalmente a senha

CREATE OR REPLACE FUNCTION public.confirm_client_company_link(
    p_token UUID,
    p_password TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conf_record RECORD;
    new_client_id UUID;
    v_company_slug TEXT;
    v_password_hash TEXT;
BEGIN
    -- 1. Busca a confirmação pendente
    SELECT cc.*, c.slug as company_slug 
    INTO conf_record 
    FROM public.client_confirmations cc
    JOIN public.companies c ON c.id = cc.company_id
    WHERE cc.confirmation_token = p_token AND cc.confirmed_at IS NULL;
    
    IF NOT FOUND THEN
        -- Verifica se já foi confirmado mas a senha ainda não foi definida (se p_password for enviado agora)
        SELECT cc.*, c.slug as company_slug 
        INTO conf_record 
        FROM public.client_confirmations cc
        JOIN public.companies c ON c.id = cc.company_id
        WHERE cc.confirmation_token = p_token AND cc.confirmed_at IS NOT NULL;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'Link inválido ou expirado.');
        END IF;
    END IF;
    
    -- 2. Se a senha foi fornecida, gera o hash
    IF p_password IS NOT NULL THEN
        v_password_hash := crypt(p_password, gen_salt('bf'));
    ELSE
        v_password_hash := conf_record.password_hash;
    END IF;

    -- 3. Marca como confirmado se ainda não estava
    UPDATE public.client_confirmations 
    SET confirmed_at = now(),
        password_hash = COALESCE(v_password_hash, password_hash)
    WHERE id = conf_record.id;
    
    -- 4. Insere ou atualiza o cliente com a senha contextual
    INSERT INTO public.clients (user_id, company_id, name, email, phone, cpf, password_hash)
    VALUES (
        conf_record.user_id, 
        conf_record.company_id, 
        conf_record.name, 
        conf_record.email, 
        conf_record.phone, 
        conf_record.cpf, 
        v_password_hash
    )
    ON CONFLICT (user_id, company_id) DO UPDATE 
    SET 
        name = EXCLUDED.name, 
        phone = EXCLUDED.phone, 
        cpf = EXCLUDED.cpf, 
        password_hash = COALESCE(EXCLUDED.password_hash, clients.password_hash),
        updated_at = now()
    RETURNING id INTO new_client_id;

    RETURN json_build_object(
        'success', true, 
        'client_id', new_client_id, 
        'company_slug', conf_record.company_slug
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_client_company_link(UUID, TEXT) TO anon, authenticated, service_role;

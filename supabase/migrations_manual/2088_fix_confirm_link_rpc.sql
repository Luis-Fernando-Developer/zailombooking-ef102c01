-- Migração para consolidar a lógica de confirmação de vínculo multi-empresa.
-- Esta migração garante que a RPC confirm_client_company_link exista e tenha a lógica correta.

DROP FUNCTION IF EXISTS public.confirm_client_company_link(UUID);
CREATE OR REPLACE FUNCTION public.confirm_client_company_link(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conf_record RECORD;
    new_client_id UUID;
BEGIN
    -- 1. Busca a confirmação pendente
    SELECT * INTO conf_record 
    FROM public.client_confirmations 
    WHERE confirmation_token = p_token AND confirmed_at IS NULL;
    
    IF NOT FOUND THEN
        -- Verifica se já foi confirmado anteriormente
        IF EXISTS (SELECT 1 FROM public.client_confirmations WHERE confirmation_token = p_token AND confirmed_at IS NOT NULL) THEN
            RETURN json_build_object('success', true, 'message', 'Este vínculo já foi confirmado anteriormente.');
        END IF;
        
        RETURN json_build_object('success', false, 'error', 'Link de confirmação inválido, expirado ou já utilizado.');
    END IF;
    
    -- 2. Marca como confirmado
    UPDATE public.client_confirmations 
    SET confirmed_at = now() 
    WHERE id = conf_record.id;
    
    -- 3. Cria ou atualiza o vínculo na tabela clients
    -- A constraint unique (user_id, company_id) deve existir (criada na migração 2083)
    INSERT INTO public.clients (user_id, company_id, name, email, phone, cpf, password_hash)
    VALUES (
        conf_record.user_id, 
        conf_record.company_id, 
        conf_record.name, 
        conf_record.email, 
        conf_record.phone, 
        conf_record.cpf, 
        conf_record.password_hash
    )
    ON CONFLICT (user_id, company_id) DO UPDATE 
    SET 
        name = EXCLUDED.name, 
        phone = EXCLUDED.phone, 
        cpf = EXCLUDED.cpf, 
        password_hash = EXCLUDED.password_hash,
        updated_at = now()
    RETURNING id INTO new_client_id;

    RETURN json_build_object('success', true, 'client_id', new_client_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.confirm_client_company_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_client_company_link(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_client_company_link(UUID) TO anon;

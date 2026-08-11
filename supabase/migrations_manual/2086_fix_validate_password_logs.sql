-- Migração para corrigir a RPC de validação de senha e garantir logs adequados.
-- O erro "Você não possui cadastro nesta empresa" ocorre quando a query não encontra o vínculo.

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

    -- 2. Busca o cliente (Removendo sensibilidade a maiúsculas no e-mail para evitar erros de digitação)
    SELECT * INTO v_client_record 
    FROM public.clients 
    WHERE LOWER(email) = LOWER(p_email) AND company_id = v_company_id;

    IF NOT FOUND THEN
        -- Debug: verificar se o usuário existe em OUTRA empresa
        IF EXISTS (SELECT 1 FROM public.clients WHERE LOWER(email) = LOWER(p_email)) THEN
             RETURN json_build_object('success', false, 'error', 'Você possui conta no Zailom, mas ainda não confirmou seu vínculo com esta empresa. Verifique seu e-mail/WhatsApp para confirmar o cadastro.');
        ELSE
             RETURN json_build_object('success', false, 'error', 'Você não possui cadastro nesta empresa. Por favor, crie uma conta primeiro.');
        END IF;
    END IF;

    -- 3. Valida a senha específica da empresa
    IF v_client_record.password_hash IS NOT NULL AND v_client_record.password_hash != p_password THEN
        RAISE NOTICE 'Senha incorreta para usuario % na empresa %. Esperado: %, Recebido: %', p_email, p_company_slug, v_client_record.password_hash, p_password;
        RETURN json_build_object('success', false, 'error', 'A senha informada não corresponde à senha definida para esta empresa.');
    END IF;

    -- Se chegou aqui, a senha é válida para ESTA empresa.
    RETURN json_build_object('success', true, 'user_id', v_client_record.user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_client_password(TEXT, TEXT, TEXT) TO anon, authenticated;

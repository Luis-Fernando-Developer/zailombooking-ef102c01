-- Migração para permitir cadastro de usuário em múltiplas empresas com confirmação de e-mail por empresa.
-- Esta migração cria uma tabela de confirmações temporárias para garantir que o usuário precise confirmar seu vínculo com cada nova empresa.

-- 1. Tabela para rastrear convites/cadastros pendentes por empresa
CREATE TABLE IF NOT EXISTS public.client_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    confirmation_token UUID DEFAULT gen_random_uuid(),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Campos para o perfil do cliente
    name TEXT,
    phone TEXT,
    cpf TEXT,
    password_hash TEXT, -- Armazena hash da senha específica para esta empresa
    UNIQUE(user_id, company_id)
);

-- Adicionar coluna de senha na tabela clients também
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password_hash TEXT;


-- 2. Habilitar RLS e permissões
ALTER TABLE public.client_confirmations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.client_confirmations TO authenticated;
GRANT ALL ON public.client_confirmations TO service_role;
GRANT INSERT ON public.client_confirmations TO anon;

-- 3. Políticas
CREATE POLICY "Usuários podem ver suas próprias confirmações"
ON public.client_confirmations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. Função para confirmar o vínculo e criar o perfil no clients
CREATE OR REPLACE FUNCTION public.confirm_client_company_link(token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conf_record RECORD;
    new_client_id UUID;
BEGIN
    -- Busca a confirmação pendente
    SELECT * INTO conf_record 
    FROM public.client_confirmations 
    WHERE confirmation_token = token AND confirmed_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Link de confirmação inválido ou já utilizado.');
    END IF;
    
    -- Marca como confirmado
    UPDATE public.client_confirmations 
    SET confirmed_at = now() 
    WHERE id = conf_record.id;
    
    -- Cria o vínculo na tabela clients
    INSERT INTO public.clients (user_id, company_id, name, email, phone, cpf)
    VALUES (conf_record.user_id, conf_record.company_id, conf_record.name, conf_record.email, conf_record.phone, conf_record.cpf)
    ON CONFLICT (user_id, company_id) DO UPDATE 
    SET name = EXCLUDED.name, phone = EXCLUDED.phone, cpf = EXCLUDED.cpf
    RETURNING id INTO new_client_id;
    
    RETURN json_build_object('success', true, 'client_id', new_client_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_client_company_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_client_company_link(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_client_company_link(UUID) TO anon;

-- 5. RPC Segura para buscar ID por email (apenas para fluxo de cadastro multi-empresa)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
    RETURN (SELECT id FROM auth.users WHERE email = _email LIMIT 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;


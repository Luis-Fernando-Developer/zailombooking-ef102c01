-- Migration 2078: Configuração de gateways via painel Super Admin
-- Cria tabela protegida para armazenar credenciais/configurações de gateways
-- acessível apenas por super admins. Edge functions fazem fallback de
-- Deno.env.get() para esta tabela, permitindo configuração via UI.

CREATE TABLE IF NOT EXISTS public.super_admin_gateway_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, key)
);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_super_admin_gateway_configs_provider_key
  ON public.super_admin_gateway_configs(provider, key);

-- Grants: authenticated gerencia (RLS restringe a super admins), service_role all
GRANT SELECT, INSERT, UPDATE, DELETE ON public.super_admin_gateway_configs TO authenticated;
GRANT ALL ON public.super_admin_gateway_configs TO service_role;

-- RLS obrigatório
ALTER TABLE public.super_admin_gateway_configs ENABLE ROW LEVEL SECURITY;

-- Garante que a função is_super_admin existe antes de criar a policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
  ) THEN
    RAISE EXCEPTION 'A função public.is_super_admin não existe. Crie-a antes de aplicar esta migration.';
  END IF;
END $$;

DROP POLICY IF EXISTS "Super admins can manage gateway configs" ON public.super_admin_gateway_configs;
CREATE POLICY "Super admins can manage gateway configs"
ON public.super_admin_gateway_configs
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Trigger para atualizar updated_at e updated_by automaticamente
CREATE OR REPLACE FUNCTION public.trg_super_admin_gateway_configs_set_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_super_admin_gateway_configs ON public.super_admin_gateway_configs;
CREATE TRIGGER set_updated_super_admin_gateway_configs
BEFORE INSERT OR UPDATE ON public.super_admin_gateway_configs
FOR EACH ROW
EXECUTE FUNCTION public.trg_super_admin_gateway_configs_set_updated();

-- Seed com as configurações esperadas pelos gateways (valores vazios)
INSERT INTO public.super_admin_gateway_configs (provider, key, is_secret, description)
VALUES
  ('asaas', 'ASAAS_API_KEY', true, 'Chave de API do Asaas (access_token). Sandbox começa com $aact_... ou contém hmlg.'),
  ('asaas', 'ASAAS_WEBHOOK_TOKEN', true, 'Token de validação dos webhooks enviados pelo Asaas (cabeçalho asaas-access-token).'),
  ('stripe', 'STRIPE_SECRET_KEY', true, 'Chave secreta do Stripe (sk_...).'),
  ('stripe', 'STRIPE_WEBHOOK_SECRET', true, 'Webhook secret do Stripe endpoint (whsec_...).'),
  ('whatsapp', 'EVOLUTION_GLOBAL_API_KEY', true, 'API key global da Evolution API / wa-service.'),
  ('whatsapp', 'EVOLUTION_GLOBAL_URL', false, 'URL base do serviço de WhatsApp (ex: https://wa.zailom.com).')
ON CONFLICT (provider, key) DO UPDATE SET
  description = EXCLUDED.description,
  is_secret = EXCLUDED.is_secret;

-- ============================================================================
-- 2061 — Migração para wa-service (wa.zailom.com)
-- ----------------------------------------------------------------------------
-- Booking deixa de falar com a Evolution diretamente. Todo tráfego WhatsApp
-- passa pelo serviço central `wa-service` autenticado com uma API key por
-- company (emitida via Admin API do wa-service e guardada aqui).
-- Colunas `evolution_*` viram legado e ficam apenas por compatibilidade
-- durante a transição.
-- ============================================================================

-- 1. whatsapp_integration: campos do wa-service ------------------------------
ALTER TABLE public.whatsapp_integration
  ADD COLUMN IF NOT EXISTS wa_tenant_id      UUID,
  ADD COLUMN IF NOT EXISTS wa_api_key        TEXT,   -- server-only
  ADD COLUMN IF NOT EXISTS wa_api_key_prefix TEXT;   -- 12 chars visíveis

COMMENT ON COLUMN public.whatsapp_integration.evolution_base_url       IS 'DEPRECATED: uso legado, wa-service centraliza a Evolution';
COMMENT ON COLUMN public.whatsapp_integration.evolution_global_api_key IS 'DEPRECATED: uso legado, wa-service centraliza a Evolution';
COMMENT ON COLUMN public.whatsapp_integration.wa_tenant_id             IS 'ID do tenant no wa-service (fonte única)';
COMMENT ON COLUMN public.whatsapp_integration.wa_api_key               IS 'API key emitida pelo wa-service para esta company (secret, nunca exposta)';

-- 2. whatsapp_instances: ID no wa-service ------------------------------------
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS wa_instance_id UUID;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_wa_instance_id
  ON public.whatsapp_instances(wa_instance_id);

COMMENT ON COLUMN public.whatsapp_instances.instance_api_key IS 'DEPRECATED: wa-service resolve a chave por trás do wa_instance_id';
COMMENT ON COLUMN public.whatsapp_instances.wa_instance_id   IS 'PK da instância no wa-service (retornado por POST /v1/instances/create)';

-- 3. Recria a view pública expondo apenas flags do wa-service ---------------
CREATE OR REPLACE VIEW public.whatsapp_integration_public AS
SELECT id, company_id, evolution_base_url, api_key_prefix, is_active,
       last_synced_at, created_at, updated_at,
       (evolution_global_api_key IS NOT NULL) AS has_global_key,
       wa_tenant_id,
       wa_api_key_prefix,
       (wa_api_key IS NOT NULL) AS has_wa_key
FROM public.whatsapp_integration;

GRANT SELECT ON public.whatsapp_integration_public TO authenticated;

-- 4. Idempotência dos webhooks entregues pelo wa-service ---------------------
CREATE TABLE IF NOT EXISTS public.wa_webhook_deliveries (
  delivery_id UUID PRIMARY KEY,
  company_id  UUID,
  event       TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_webhook_deliveries_company
  ON public.wa_webhook_deliveries(company_id, received_at DESC);

GRANT SELECT, INSERT ON public.wa_webhook_deliveries TO service_role;

ALTER TABLE public.wa_webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_webhook_deliveries_service_only" ON public.wa_webhook_deliveries;
CREATE POLICY "wa_webhook_deliveries_service_only" ON public.wa_webhook_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

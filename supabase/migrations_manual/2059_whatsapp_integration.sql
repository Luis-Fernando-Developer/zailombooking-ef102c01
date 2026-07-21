-- ============================================================================
-- 2059 — Integração WhatsApp direta (Evolution API) + roteamento + templates
-- ----------------------------------------------------------------------------
-- Cria a base para o Booking enviar notificações WhatsApp SEM depender do
-- Zailom Flow. Suporta:
--   • Múltiplas instâncias Evolution por empresa
--   • Preferência de canal por empresa (auto / flow_only / direct_only / disabled)
--   • Templates de mensagem por evento (booking.created / .confirmed / .cancelled / .reminder)
-- Chave da Evolution NUNCA é lida no client — apenas via edge function
-- `whatsapp-integration` com service_role.
-- ============================================================================

-- 1. Preferência de canal por empresa ---------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp_channel_preference TEXT NOT NULL DEFAULT 'auto'
    CHECK (whatsapp_channel_preference IN ('auto','flow_only','direct_only','disabled'));

-- 2. Config global Evolution (uma linha por empresa) ------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_integration (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  evolution_base_url       TEXT NOT NULL,
  evolution_global_api_key TEXT,          -- server-only. usada para criar/listar instâncias
  api_key_prefix           TEXT,          -- primeiros 8 chars visíveis no client
  is_active                BOOLEAN NOT NULL DEFAULT false,
  last_synced_at           TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_integration_company ON public.whatsapp_integration(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_integration TO authenticated;
GRANT ALL ON public.whatsapp_integration TO service_role;

ALTER TABLE public.whatsapp_integration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_integration_tenant_all" ON public.whatsapp_integration;
CREATE POLICY "whatsapp_integration_tenant_all" ON public.whatsapp_integration
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- View que oculta as chaves para leitura do client ---------------------------
CREATE OR REPLACE VIEW public.whatsapp_integration_public AS
SELECT id, company_id, evolution_base_url, api_key_prefix, is_active,
       last_synced_at, created_at, updated_at,
       (evolution_global_api_key IS NOT NULL) AS has_global_key
FROM public.whatsapp_integration;

GRANT SELECT ON public.whatsapp_integration_public TO authenticated;

-- 3. Instâncias Evolution (várias por empresa) ------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id    UUID REFERENCES public.whatsapp_integration(id) ON DELETE SET NULL,
  instance_name     TEXT NOT NULL,
  instance_api_key  TEXT,                     -- server-only. apikey específica da instância (Evolution)
  api_key_prefix    TEXT,                     -- 8 primeiros chars, expostos ao client
  connected_number  TEXT,                     -- E.164 lido do fetchInstances
  status            TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (status IN ('connected','disconnected','qrcode','connecting','unknown')),
  is_default        BOOLEAN NOT NULL DEFAULT false,
  last_synced_at    TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, instance_name)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_company ON public.whatsapp_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_default ON public.whatsapp_instances(company_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_instances_tenant_all" ON public.whatsapp_instances;
CREATE POLICY "whatsapp_instances_tenant_all" ON public.whatsapp_instances
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE OR REPLACE VIEW public.whatsapp_instances_public AS
SELECT id, company_id, integration_id, instance_name, api_key_prefix,
       connected_number, status, is_default, last_synced_at, metadata,
       created_at, updated_at,
       (instance_api_key IS NOT NULL) AS has_instance_key
FROM public.whatsapp_instances;

GRANT SELECT ON public.whatsapp_instances_public TO authenticated;

-- Garante no máximo uma default por empresa
CREATE OR REPLACE FUNCTION public.whatsapp_instances_single_default()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.whatsapp_instances
       SET is_default = false
     WHERE company_id = NEW.company_id
       AND id <> NEW.id
       AND is_default;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_whatsapp_instances_single_default ON public.whatsapp_instances;
CREATE TRIGGER trg_whatsapp_instances_single_default
  BEFORE INSERT OR UPDATE OF is_default ON public.whatsapp_instances
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.whatsapp_instances_single_default();

-- 4. Templates de mensagem por evento ---------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_key    TEXT NOT NULL
               CHECK (event_key IN (
                 'booking.created','booking.confirmed','booking.cancelled',
                 'booking.rescheduled','booking.reminder','marketing.custom'
               )),
  enabled      BOOLEAN NOT NULL DEFAULT true,
  template     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_company ON public.whatsapp_templates(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_templates_tenant_all" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_tenant_all" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- 5. Helper: resolver canal WhatsApp ativo para uma empresa -----------------
-- Retorna: 'flow' | 'direct' | 'none'
CREATE OR REPLACE FUNCTION public.resolve_whatsapp_channel(p_company UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pref  TEXT;
  v_flow  BOOLEAN;
  v_dir   BOOLEAN;
BEGIN
  SELECT COALESCE(whatsapp_channel_preference,'auto') INTO v_pref
    FROM companies WHERE id = p_company;
  IF v_pref = 'disabled' THEN RETURN 'none'; END IF;

  SELECT COALESCE(is_active, false) INTO v_flow
    FROM chatbot_integration WHERE company_id = p_company;
  SELECT EXISTS(
    SELECT 1 FROM whatsapp_instances
     WHERE company_id = p_company
       AND status = 'connected'
  ) INTO v_dir;

  IF v_pref IN ('auto','flow_only')   AND COALESCE(v_flow,false) THEN RETURN 'flow'; END IF;
  IF v_pref IN ('auto','direct_only') AND v_dir                  THEN RETURN 'direct'; END IF;
  RETURN 'none';
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_channel(UUID) TO authenticated, service_role;

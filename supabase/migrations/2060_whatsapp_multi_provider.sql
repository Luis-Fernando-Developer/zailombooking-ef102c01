-- ============================================================================
-- 2060 — WhatsApp multi-provider + labels neutras + auto-numeração + limites
-- ----------------------------------------------------------------------------
-- - Enum `whatsapp_provider` (evolution + placeholders para wppconnect, baileys,
--   whatsapp-web-js, gowa). Só evolution está funcional; demais ficam preparados.
-- - Colunas em `whatsapp_instances`: provider, display_index, friendly_name,
--   channel_preference (override per-instance).
-- - Tabela `whatsapp_message_usage` para contagem mensal por empresa.
-- - RPC `whatsapp_get_plan_limits(company_id)` retorna limites conforme plano
--   assinado. Espelha os limites usados no provision-zailom-flow, mas com
--   Enterprise = ilimitado, conforme regra de negócio atual.
-- ============================================================================

-- 1. Enum de providers -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.whatsapp_provider AS ENUM (
    'evolution',
    'wppconnect',
    'baileys',
    'whatsapp-web-js',
    'gowa'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Novas colunas em whatsapp_instances -------------------------------------
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS provider           public.whatsapp_provider NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS display_index      INT,
  ADD COLUMN IF NOT EXISTS friendly_name      TEXT,
  ADD COLUMN IF NOT EXISTS channel_preference TEXT
    CHECK (channel_preference IS NULL OR channel_preference IN ('auto','flow_only','direct_only','disabled'));

-- Backfill: friendly_name a partir do instance_name atual, display_index sequencial
UPDATE public.whatsapp_instances
   SET friendly_name = COALESCE(friendly_name, instance_name)
 WHERE friendly_name IS NULL;

WITH seq AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) AS rn
    FROM public.whatsapp_instances
)
UPDATE public.whatsapp_instances w
   SET display_index = seq.rn
  FROM seq
 WHERE w.id = seq.id AND w.display_index IS NULL;

-- friendly_name deve ser único por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_instances_friendly_name
  ON public.whatsapp_instances (company_id, lower(friendly_name));

-- display_index único por empresa (respeitando providers como um espaço único
-- para simplificar identificação no painel global da Evolution)
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_instances_display_index
  ON public.whatsapp_instances (company_id, display_index);

-- 3. Trigger para atribuir display_index automaticamente ---------------------
CREATE OR REPLACE FUNCTION public.whatsapp_instances_assign_index()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_next INT;
BEGIN
  IF NEW.display_index IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Advisory lock por empresa para evitar corrida em criação simultânea
  PERFORM pg_advisory_xact_lock(hashtext('whatsapp_instances_idx:' || NEW.company_id::text));
  SELECT COALESCE(MAX(display_index), 0) + 1 INTO v_next
    FROM public.whatsapp_instances
   WHERE company_id = NEW.company_id;
  NEW.display_index := v_next;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_whatsapp_instances_assign_index ON public.whatsapp_instances;
CREATE TRIGGER trg_whatsapp_instances_assign_index
  BEFORE INSERT ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_instances_assign_index();

-- 4. View pública ------------------------------------------------------------
DROP VIEW IF EXISTS public.whatsapp_instances_public;
CREATE VIEW public.whatsapp_instances_public AS
SELECT id, company_id, integration_id, instance_name, api_key_prefix,
       connected_number, status, is_default, last_synced_at, metadata,
       created_at, updated_at,
       provider, display_index, friendly_name,
       COALESCE(channel_preference, 'auto') AS channel_preference,
       (instance_api_key IS NOT NULL) AS has_instance_key
FROM public.whatsapp_instances;

GRANT SELECT ON public.whatsapp_instances_public TO authenticated;

-- 5. Contagem de mensagens por mês ------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_message_usage (
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month   TEXT NOT NULL,          -- ex.: '2026-07'
  sent_count   INT  NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_wa_usage_company ON public.whatsapp_message_usage(company_id);

GRANT SELECT ON public.whatsapp_message_usage TO authenticated;
GRANT ALL    ON public.whatsapp_message_usage TO service_role;

ALTER TABLE public.whatsapp_message_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_usage_tenant_read" ON public.whatsapp_message_usage;
CREATE POLICY "wa_usage_tenant_read" ON public.whatsapp_message_usage
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Helper para incrementar (usado pela edge/helper via service_role)
CREATE OR REPLACE FUNCTION public.whatsapp_bump_usage(p_company UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_new   INT;
BEGIN
  INSERT INTO whatsapp_message_usage (company_id, year_month, sent_count, updated_at)
  VALUES (p_company, v_month, 1, now())
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET sent_count = whatsapp_message_usage.sent_count + 1,
                updated_at = now()
  RETURNING sent_count INTO v_new;
  RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION public.whatsapp_bump_usage(UUID) TO service_role;

-- 6. Limites por plano -------------------------------------------------------
-- Retorna { plan_tier, max_connections, max_messages_month, current_connections,
--          current_messages_month, connections_allowed, messages_allowed }
-- max=NULL significa ilimitado.
CREATE OR REPLACE FUNCTION public.whatsapp_get_plan_limits(p_company UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_name TEXT;
  v_tier      TEXT := 'starter';
  v_max_conn  INT;
  v_max_msg   INT;
  v_cur_conn  INT;
  v_cur_msg   INT;
  v_month     TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
BEGIN
  SELECT lower(sp.name) INTO v_plan_name
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
   WHERE cs.company_id = p_company
   LIMIT 1;

  IF v_plan_name IS NULL THEN
    v_tier := 'starter';
  ELSIF v_plan_name ILIKE '%enterprise%' OR v_plan_name ILIKE '%business%' THEN
    v_tier := 'enterprise';
  ELSIF v_plan_name ILIKE '%professional%' OR v_plan_name ILIKE '%pro%' THEN
    v_tier := 'professional';
  ELSE
    v_tier := 'starter';
  END IF;

  IF v_tier = 'enterprise' THEN
    v_max_conn := NULL; v_max_msg := NULL;
  ELSIF v_tier = 'professional' THEN
    v_max_conn := 3; v_max_msg := 5000;
  ELSE
    v_max_conn := 1; v_max_msg := 700;
  END IF;

  SELECT COUNT(*) INTO v_cur_conn
    FROM whatsapp_instances WHERE company_id = p_company;

  SELECT COALESCE(sent_count, 0) INTO v_cur_msg
    FROM whatsapp_message_usage
   WHERE company_id = p_company AND year_month = v_month;
  v_cur_msg := COALESCE(v_cur_msg, 0);

  RETURN jsonb_build_object(
    'plan_tier', v_tier,
    'plan_name', v_plan_name,
    'max_connections', v_max_conn,
    'max_messages_month', v_max_msg,
    'current_connections', v_cur_conn,
    'current_messages_month', v_cur_msg,
    'connections_allowed', (v_max_conn IS NULL OR v_cur_conn < v_max_conn),
    'messages_allowed',    (v_max_msg  IS NULL OR v_cur_msg  < v_max_msg)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.whatsapp_get_plan_limits(UUID) TO authenticated, service_role;

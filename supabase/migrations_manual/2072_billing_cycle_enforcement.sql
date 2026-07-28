-- =====================================================================
-- 2072: Ciclo de faturamento em 4 camadas.
-- Adiciona campos em company_subscriptions e cria funcoes de enforcement.
-- =====================================================================

-- 1) Colunas de ciclo
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS cycle_start_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_renewal_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_invoice_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_until           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_status        TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_free_override      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_cycles_remaining INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_admin_created  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_paid_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_period        TEXT NOT NULL DEFAULT 'monthly';

-- constraint no billing_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_subscriptions_billing_status_chk'
  ) THEN
    ALTER TABLE public.company_subscriptions
      ADD CONSTRAINT company_subscriptions_billing_status_chk
      CHECK (billing_status IN ('active','past_due','suspended','paused','blocked'));
  END IF;
END $$;

-- 2) helper: intervalo do ciclo
CREATE OR REPLACE FUNCTION public.cycle_interval(_period TEXT)
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(_period)
    WHEN 'annual'    THEN INTERVAL '365 days'
    WHEN 'quarterly' THEN INTERVAL '90 days'
    ELSE                  INTERVAL '30 days'
  END
$$;

-- 3) inicializar campos de ciclo em assinaturas existentes
UPDATE public.company_subscriptions cs
SET
  cycle_start_at  = COALESCE(cs.cycle_start_at, cs.created_at, now()),
  next_renewal_at = COALESCE(cs.next_renewal_at,
                             COALESCE(cs.created_at, now()) + public.cycle_interval(COALESCE(cs.billing_period,'monthly'))),
  next_invoice_at = COALESCE(cs.next_invoice_at,
                             COALESCE(cs.created_at, now()) + public.cycle_interval(COALESCE(cs.billing_period,'monthly')) - INTERVAL '5 days'),
  grace_until     = COALESCE(cs.grace_until,
                             COALESCE(cs.created_at, now()) + public.cycle_interval(COALESCE(cs.billing_period,'monthly')) + INTERVAL '24 hours')
WHERE cs.cycle_start_at IS NULL
   OR cs.next_renewal_at IS NULL;

-- 4) enforce_subscription_status
CREATE OR REPLACE FUNCTION public.enforce_subscription_status(_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  paid_current BOOLEAN;
  new_status TEXT;
BEGIN
  SELECT * INTO s
  FROM public.company_subscriptions
  WHERE company_id = _company_id;

  IF NOT FOUND THEN
    RETURN 'no_subscription';
  END IF;

  -- Camada 1: paused/blocked mantem-se
  IF s.billing_status IN ('paused','blocked') THEN
    RETURN s.billing_status;
  END IF;

  -- pagamento do ciclo atual foi confirmado?
  paid_current := s.last_paid_at IS NOT NULL
                  AND s.last_paid_at >= s.cycle_start_at;

  -- Camada 3: plano gratis 100% via super-admin
  -- se ha ciclos gratis restantes, considera pago
  IF s.is_free_override AND s.free_cycles_remaining > 0 THEN
    paid_current := true;
  END IF;

  -- Camada 4: criado manualmente pelo super-admin sem pagamento -> exige pagamento
  -- (mesma logica: paid_current governa)

  -- Camada 2: apos grace_until sem pagamento => suspended
  IF now() > s.grace_until AND NOT paid_current THEN
    new_status := 'suspended';
  ELSIF now() > s.next_renewal_at AND NOT paid_current THEN
    new_status := 'past_due';
  ELSE
    new_status := 'active';
  END IF;

  IF new_status <> s.billing_status THEN
    UPDATE public.company_subscriptions
       SET billing_status = new_status,
           updated_at     = now()
     WHERE company_id = _company_id;
  END IF;

  RETURN new_status;
END $$;

-- 5) is_company_active
CREATE OR REPLACE FUNCTION public.is_company_active(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st TEXT;
BEGIN
  SELECT billing_status INTO st
  FROM public.company_subscriptions
  WHERE company_id = _company_id;

  IF st IS NULL THEN RETURN true; END IF;
  RETURN st = 'active' OR st = 'past_due';
END $$;

-- 6) renovar ciclo apos pagamento confirmado
CREATE OR REPLACE FUNCTION public.renew_subscription_cycle(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  iv INTERVAL;
BEGIN
  SELECT * INTO s FROM public.company_subscriptions
  WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  iv := public.cycle_interval(COALESCE(s.billing_period,'monthly'));

  UPDATE public.company_subscriptions
     SET cycle_start_at        = now(),
         next_renewal_at       = now() + iv,
         next_invoice_at       = now() + iv - INTERVAL '5 days',
         grace_until           = now() + iv + INTERVAL '24 hours',
         last_paid_at          = now(),
         billing_status        = 'active',
         free_cycles_remaining = GREATEST(0, s.free_cycles_remaining - CASE WHEN s.is_free_override THEN 1 ELSE 0 END),
         updated_at            = now()
   WHERE company_id = _company_id;
END $$;

-- 7) integrar no check_plan_limit existente:
-- criar wrapper que retorna reason='subscription_suspended' se empresa nao esta ativa.
CREATE OR REPLACE FUNCTION public.check_plan_limit_v2(_company_id UUID, _resource TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base JSONB;
  st TEXT;
BEGIN
  SELECT billing_status INTO st
  FROM public.company_subscriptions WHERE company_id = _company_id;

  IF st IN ('suspended','blocked','paused') THEN
    RETURN jsonb_build_object(
      'resource', _resource,
      'current', 0,
      'limit', 0,
      'unlimited', false,
      'in_grace', false,
      'grace_until', null,
      'allowed', false,
      'plan_name', null,
      'subscription_status', st
    );
  END IF;

  base := public.check_plan_limit(_company_id, _resource::text);
  RETURN base || jsonb_build_object('subscription_status', COALESCE(st,'active'));
END $$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit_v2(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_active(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_subscription_cycle(UUID)    TO service_role;

-- 8) worker: rodar hourly (pg_cron opcional; use edge cron externo se nao houver)
-- Descomente se pg_cron esta instalado:
-- SELECT cron.schedule('enforce-subs-hourly','5 * * * *', $$
--   SELECT public.enforce_subscription_status(company_id) FROM public.company_subscriptions;
-- $$);

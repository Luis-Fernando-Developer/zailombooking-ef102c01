-- =====================================================================
-- 2074: Reset MENSAL de uso, independente do ciclo de cobrança.
--
-- Regra:
--   - billing_period (monthly/quarterly/annual) define apenas quando
--     um novo pagamento é cobrado (paid_until).
--   - O ciclo de USO (cycle_start_at) rola SEMPRE a cada 30 dias
--     enquanto a assinatura estiver paga (now() < paid_until).
--   - Ex.: anual => 12 renovações mensais de uso; ao fim dos 365 dias
--     exige novo pagamento.
-- =====================================================================

-- 1) coluna paid_until (fim do período pago)
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;

-- Backfill: se ja existe last_paid_at, paid_until = last_paid_at + billing_period.
-- Caso contrario, usa next_renewal_at (comportamento antigo do mensal).
UPDATE public.company_subscriptions cs
SET paid_until = COALESCE(
      cs.paid_until,
      CASE
        WHEN cs.last_paid_at IS NOT NULL
          THEN cs.last_paid_at + public.cycle_interval(COALESCE(cs.billing_period,'monthly'))
        ELSE COALESCE(cs.next_renewal_at, now() + INTERVAL '30 days')
      END
    )
WHERE cs.paid_until IS NULL;

-- 2) rollover do ciclo de uso (mensal)
--    Avança cycle_start_at em blocos de 30 dias ate cobrir "now()".
--    Nao mexe em paid_until.
CREATE OR REPLACE FUNCTION public.roll_usage_cycle_if_needed(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  new_start TIMESTAMPTZ;
BEGIN
  SELECT * INTO s FROM public.company_subscriptions
  WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF s.cycle_start_at IS NULL THEN
    UPDATE public.company_subscriptions
       SET cycle_start_at  = now(),
           next_renewal_at = now() + INTERVAL '30 days',
           updated_at      = now()
     WHERE company_id = _company_id;
    RETURN;
  END IF;

  -- Só rola se o próximo marco mensal já passou
  IF now() < COALESCE(s.next_renewal_at, s.cycle_start_at + INTERVAL '30 days') THEN
    RETURN;
  END IF;

  new_start := s.cycle_start_at;
  WHILE new_start + INTERVAL '30 days' <= now() LOOP
    new_start := new_start + INTERVAL '30 days';
  END LOOP;

  UPDATE public.company_subscriptions
     SET cycle_start_at  = new_start,
         next_renewal_at = new_start + INTERVAL '30 days',
         updated_at      = now()
   WHERE company_id = _company_id;
END $$;

-- 3) enforce_subscription_status baseado em paid_until (não em next_renewal_at)
CREATE OR REPLACE FUNCTION public.enforce_subscription_status(_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  paid_current BOOLEAN;
  effective_paid_until TIMESTAMPTZ;
  effective_grace TIMESTAMPTZ;
  new_status TEXT;
BEGIN
  SELECT * INTO s
  FROM public.company_subscriptions
  WHERE company_id = _company_id;

  IF NOT FOUND THEN
    RETURN 'no_subscription';
  END IF;

  -- Rola o ciclo de USO mensal antes de tudo (não afeta status)
  PERFORM public.roll_usage_cycle_if_needed(_company_id);

  IF s.billing_status IN ('paused','blocked') THEN
    RETURN s.billing_status;
  END IF;

  effective_paid_until := s.paid_until;

  -- Free override: considera pago enquanto houver ciclos gratis
  IF s.is_free_override AND s.free_cycles_remaining > 0 THEN
    effective_paid_until := GREATEST(
      COALESCE(effective_paid_until, now()),
      now() + INTERVAL '1 day'
    );
  END IF;

  paid_current := effective_paid_until IS NOT NULL AND now() < effective_paid_until;
  effective_grace := COALESCE(effective_paid_until, s.grace_until) + INTERVAL '24 hours';

  IF NOT paid_current AND now() > effective_grace THEN
    new_status := 'suspended';
  ELSIF NOT paid_current THEN
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

-- 4) renew_subscription_cycle: pagamento estende paid_until pelo billing_period
--    e reinicia ciclo de USO mensal.
CREATE OR REPLACE FUNCTION public.renew_subscription_cycle(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  period_iv INTERVAL;
  base_from TIMESTAMPTZ;
BEGIN
  SELECT * INTO s FROM public.company_subscriptions
  WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  period_iv := public.cycle_interval(COALESCE(s.billing_period,'monthly'));

  -- Se ainda ha tempo pago, estende a partir do paid_until atual (nao perde dias).
  -- Se ja venceu, começa a contar de now().
  base_from := CASE
    WHEN s.paid_until IS NOT NULL AND s.paid_until > now() THEN s.paid_until
    ELSE now()
  END;

  UPDATE public.company_subscriptions
     SET paid_until            = base_from + period_iv,
         last_paid_at          = now(),
         cycle_start_at        = now(),
         next_renewal_at       = now() + INTERVAL '30 days',
         next_invoice_at       = base_from + period_iv - INTERVAL '5 days',
         grace_until           = base_from + period_iv + INTERVAL '24 hours',
         billing_status        = 'active',
         free_cycles_remaining = GREATEST(0, s.free_cycles_remaining - CASE WHEN s.is_free_override THEN 1 ELSE 0 END),
         updated_at            = now()
   WHERE company_id = _company_id;
END $$;

GRANT EXECUTE ON FUNCTION public.roll_usage_cycle_if_needed(UUID) TO service_role;

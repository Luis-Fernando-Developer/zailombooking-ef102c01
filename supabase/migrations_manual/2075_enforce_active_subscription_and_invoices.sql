-- ============================================================================
-- 2075 — Enforcement de assinatura ativa + tabela de faturas.
--
-- Problemas:
--   1. Empresas com billing_status='suspended'/'blocked'/'paused' continuam
--      criando agendamentos (o banner era só visual).
--   2. A aba "Faturas" em Gerenciar Plano estava vazia porque a tabela
--      company_invoices nunca foi criada por nenhuma migração, e nada
--      registra faturas por ciclo.
--
-- Correções:
--   A) Trigger BEFORE INSERT/UPDATE em public.bookings chamando
--      enforce_subscription_status() e bloqueando se inativo.
--   B) Cria public.company_invoices com RLS + GRANT.
--   C) renew_subscription_cycle passa a: marcar fatura corrente como paga,
--      abrir a próxima fatura do ciclo.
--   D) Backfill: gera uma fatura corrente para cada assinatura existente
--      (paga se billing_status=active e last_paid_at>=cycle_start_at,
--      overdue se suspended/past_due, senão pending).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) TRIGGER em bookings ----------------------------------------------------
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_active_subscription_on_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Só bloqueia criação e reativação. Cancelamentos/updates finais passam.
  IF TG_OP = 'UPDATE' THEN
    IF LOWER(COALESCE(NEW.booking_status::TEXT,'')) IN ('cancelled','canceled','completed','no_show')
       AND LOWER(COALESCE(OLD.booking_status::TEXT,'')) NOT IN ('cancelled','canceled','completed','no_show') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Recalcula on-the-fly (garante que 'past_due'/'suspended' esteja atualizado).
  BEGIN
    v_status := public.enforce_subscription_status(NEW.company_id);
  EXCEPTION WHEN OTHERS THEN
    -- Se enforce falhar por qualquer motivo, cai em fallback direto.
    SELECT billing_status INTO v_status
      FROM public.company_subscriptions
     WHERE company_id = NEW.company_id;
  END;

  IF v_status IN ('suspended','blocked','paused') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Sua assinatura está ' || v_status || '. Regularize o pagamento para criar novos agendamentos.',
      DETAIL  = 'subscription_' || v_status,
      ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_subscription_on_bookings ON public.bookings;
CREATE TRIGGER trg_enforce_active_subscription_on_bookings
BEFORE INSERT OR UPDATE OF booking_status, booking_date, booking_time, start_time
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_active_subscription_on_bookings();

-- ---------------------------------------------------------------------------
-- B) Tabela company_invoices ------------------------------------------------
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','overdue','cancelled','refunded','failed')),
  billing_type   TEXT,
  due_date       TIMESTAMPTZ NOT NULL,
  paid_at        TIMESTAMPTZ,
  invoice_url    TEXT,
  bank_slip_url  TEXT,
  description    TEXT,
  cycle_start_at TIMESTAMPTZ,
  cycle_end_at   TIMESTAMPTZ,
  asaas_payment_id TEXT UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A tabela pode já existir de versões anteriores com colunas diferentes.
-- Garante todas as colunas usadas abaixo antes de criar índices/policies.
ALTER TABLE public.company_invoices
  ADD COLUMN IF NOT EXISTS subscription_id  UUID REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS billing_type     TEXT,
  ADD COLUMN IF NOT EXISTS due_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_url      TEXT,
  ADD COLUMN IF NOT EXISTS bank_slip_url    TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS cycle_start_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cycle_end_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.company_invoices SET due_date = COALESCE(due_date, created_at, now()) WHERE due_date IS NULL;
ALTER TABLE public.company_invoices ALTER COLUMN due_date SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invoices_asaas_payment
  ON public.company_invoices(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_invoices_company    ON public.company_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invoices_due        ON public.company_invoices(due_date DESC);
CREATE INDEX IF NOT EXISTS idx_company_invoices_status     ON public.company_invoices(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invoice_cycle
  ON public.company_invoices(company_id, cycle_start_at)
  WHERE cycle_start_at IS NOT NULL;

GRANT SELECT ON public.company_invoices TO authenticated;
GRANT ALL    ON public.company_invoices TO service_role;

ALTER TABLE public.company_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can read invoices" ON public.company_invoices;
CREATE POLICY "Company members can read invoices"
  ON public.company_invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
       WHERE c.id = company_invoices.company_id
         AND (
           c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.employees e
              WHERE e.company_id = c.id AND e.user_id = auth.uid()
           )
         )
    )
  );

DROP POLICY IF EXISTS "Service role manages invoices" ON public.company_invoices;
CREATE POLICY "Service role manages invoices"
  ON public.company_invoices
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- C) renew_subscription_cycle: gera/marca faturas ---------------------------
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_subscription_cycle(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  iv INTERVAL;
  new_cycle_start TIMESTAMPTZ;
  new_cycle_end   TIMESTAMPTZ;
BEGIN
  SELECT * INTO s FROM public.company_subscriptions
   WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  iv := public.cycle_interval(COALESCE(s.billing_period,'monthly'));

  -- Marca fatura do ciclo atual como paga.
  UPDATE public.company_invoices
     SET status = 'paid',
         paid_at = COALESCE(paid_at, now()),
         updated_at = now()
   WHERE company_id = _company_id
     AND cycle_start_at = s.cycle_start_at
     AND status <> 'paid';

  new_cycle_start := now();
  new_cycle_end   := now() + iv;

  UPDATE public.company_subscriptions
     SET cycle_start_at        = new_cycle_start,
         next_renewal_at       = new_cycle_end,
         next_invoice_at       = new_cycle_end - INTERVAL '5 days',
         grace_until           = new_cycle_end + INTERVAL '24 hours',
         last_paid_at          = now(),
         billing_status        = 'active',
         free_cycles_remaining = GREATEST(0, s.free_cycles_remaining - CASE WHEN s.is_free_override THEN 1 ELSE 0 END),
         updated_at            = now()
   WHERE company_id = _company_id;

  -- Abre a próxima fatura pendente.
  INSERT INTO public.company_invoices
    (company_id, subscription_id, amount, status, due_date,
     cycle_start_at, cycle_end_at, description)
  VALUES (
    _company_id, s.id, COALESCE(s.original_price, 0), 'pending',
    new_cycle_end,
    new_cycle_start, new_cycle_end,
    'Assinatura ' || COALESCE(s.billing_period,'monthly') || ' — ciclo ' ||
      to_char(new_cycle_start,'DD/MM/YYYY') || ' a ' || to_char(new_cycle_end,'DD/MM/YYYY')
  )
  ON CONFLICT (company_id, cycle_start_at) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- D) Backfill de faturas ----------------------------------------------------
-- ---------------------------------------------------------------------------
INSERT INTO public.company_invoices
  (company_id, subscription_id, amount, status, due_date,
   cycle_start_at, cycle_end_at, description, paid_at)
SELECT
  s.company_id,
  s.id,
  COALESCE(s.original_price, 0),
  CASE
    WHEN s.billing_status = 'active'
         AND s.last_paid_at IS NOT NULL
         AND s.last_paid_at >= s.cycle_start_at        THEN 'paid'
    WHEN s.billing_status IN ('suspended','blocked')   THEN 'overdue'
    WHEN s.billing_status = 'past_due'                 THEN 'overdue'
    ELSE 'pending'
  END,
  COALESCE(s.next_renewal_at, s.cycle_start_at + INTERVAL '30 days'),
  s.cycle_start_at,
  COALESCE(s.next_renewal_at, s.cycle_start_at + INTERVAL '30 days'),
  'Assinatura ' || COALESCE(s.billing_period,'monthly') || ' — ciclo ' ||
    to_char(s.cycle_start_at,'DD/MM/YYYY') || ' a ' ||
    to_char(COALESCE(s.next_renewal_at, s.cycle_start_at + INTERVAL '30 days'),'DD/MM/YYYY'),
  CASE
    WHEN s.billing_status = 'active'
         AND s.last_paid_at IS NOT NULL
         AND s.last_paid_at >= s.cycle_start_at THEN s.last_paid_at
    ELSE NULL
  END
FROM public.company_subscriptions s
WHERE s.cycle_start_at IS NOT NULL
ON CONFLICT (company_id, cycle_start_at) DO NOTHING;

-- Se alguma assinatura já está past_due/suspended sem fatura anterior,
-- garante pelo menos uma fatura em atraso visível no painel.
INSERT INTO public.company_invoices
  (company_id, subscription_id, amount, status, due_date,
   cycle_start_at, cycle_end_at, description)
SELECT
  s.company_id, s.id, COALESCE(s.original_price, 0), 'overdue',
  COALESCE(s.grace_until, s.next_renewal_at, now()),
  COALESCE(s.next_renewal_at, s.cycle_start_at + INTERVAL '30 days'),
  COALESCE(s.next_renewal_at, s.cycle_start_at + INTERVAL '30 days')
    + public.cycle_interval(COALESCE(s.billing_period,'monthly')),
  'Renovação em atraso — ' || COALESCE(s.billing_period,'monthly')
FROM public.company_subscriptions s
WHERE s.billing_status IN ('past_due','suspended','blocked')
  AND NOT EXISTS (
    SELECT 1 FROM public.company_invoices ci
     WHERE ci.company_id = s.company_id
       AND ci.status IN ('pending','overdue')
  );

NOTIFY pgrst, 'reload schema';

COMMIT;

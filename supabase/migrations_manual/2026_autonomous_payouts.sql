-- =====================================================================
-- AUTONOMOUS PAYOUTS: gateway por autônomo + regras de repasse + log
-- Deploy manual via Supabase SQL editor.
-- =====================================================================

-- 1) Configuração de repasse na empresa (% e regra padrão)
ALTER TABLE public.company_payment_settings
  ADD COLUMN IF NOT EXISTS autonomous_share_pct NUMERIC(5,2) NOT NULL DEFAULT 95.00,
  ADD COLUMN IF NOT EXISTS payout_rule TEXT NOT NULL DEFAULT 'per_service'
    CHECK (payout_rule IN ('per_service','end_of_day','interval_days')),
  ADD COLUMN IF NOT EXISTS payout_interval_days INTEGER;

-- 2) Gateway próprio do autônomo (espelho do company)
CREATE TABLE IF NOT EXISTS public.employee_payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'asaas'
    CHECK (provider IN ('asaas','mercadopago','stripe','pagarme')),
  api_key_encrypted TEXT,
  account_name TEXT,
  pix_key TEXT,
  payout_rule TEXT
    CHECK (payout_rule IN ('per_service','end_of_day','interval_days')),
  payout_interval_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eps_company ON public.employee_payment_settings(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_payment_settings TO authenticated;
GRANT ALL ON public.employee_payment_settings TO service_role;

ALTER TABLE public.employee_payment_settings ENABLE ROW LEVEL SECURITY;

-- O próprio autônomo lê/edita
DROP POLICY IF EXISTS "own employee payment settings select" ON public.employee_payment_settings;
CREATE POLICY "own employee payment settings select"
  ON public.employee_payment_settings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own employee payment settings upsert" ON public.employee_payment_settings;
CREATE POLICY "own employee payment settings upsert"
  ON public.employee_payment_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own employee payment settings update" ON public.employee_payment_settings;
CREATE POLICY "own employee payment settings update"
  ON public.employee_payment_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own employee payment settings delete" ON public.employee_payment_settings;
CREATE POLICY "own employee payment settings delete"
  ON public.employee_payment_settings FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

-- 3) Log de repasses (auditoria + reconciliação)
CREATE TABLE IF NOT EXISTS public.autonomous_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  booking_id  UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  amount_total       NUMERIC(12,2) NOT NULL,
  amount_to_employee NUMERIC(12,2) NOT NULL,
  amount_to_company  NUMERIC(12,2) NOT NULL,
  company_provider   TEXT NOT NULL,
  employee_provider  TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('native_split','cross_gateway','pending')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed','refunded','reversed')),
  external_payout_id TEXT,
  error_message TEXT,
  scheduled_for TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_employee ON public.autonomous_payouts(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_company  ON public.autonomous_payouts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_booking  ON public.autonomous_payouts(booking_id);

GRANT SELECT ON public.autonomous_payouts TO authenticated;
GRANT ALL ON public.autonomous_payouts TO service_role;

ALTER TABLE public.autonomous_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payouts read own employee" ON public.autonomous_payouts;
CREATE POLICY "payouts read own employee"
  ON public.autonomous_payouts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.company_id = autonomous_payouts.company_id
                 AND e.user_id = auth.uid()
                 AND e.role IN ('owner','manager','supervisor'))
  );

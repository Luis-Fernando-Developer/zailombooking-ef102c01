-- =====================================================================
-- PAYOUT FLOW: define quem RECEBE o pagamento do cliente e repassa.
--   via_company           -> cliente paga empresa; empresa repassa % p/ autônomo
--   direct_to_autonomous  -> cliente paga autônomo; autônomo repassa % p/ empresa
-- Deploy manual via Supabase SQL editor.
-- =====================================================================

-- 1) Default da empresa
ALTER TABLE public.company_payment_settings
  ADD COLUMN IF NOT EXISTS payout_flow TEXT NOT NULL DEFAULT 'via_company'
    CHECK (payout_flow IN ('via_company','direct_to_autonomous'));

-- 2) Override por funcionário (autônomo). NULL = usa default da empresa.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS payout_flow_override TEXT
    CHECK (payout_flow_override IN ('via_company','direct_to_autonomous'));

-- 3) Log do payout guarda o fluxo aplicado (auditoria)
ALTER TABLE public.autonomous_payouts
  ADD COLUMN IF NOT EXISTS payout_flow TEXT NOT NULL DEFAULT 'via_company'
    CHECK (payout_flow IN ('via_company','direct_to_autonomous'));

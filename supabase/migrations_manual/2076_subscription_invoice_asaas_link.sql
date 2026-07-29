-- ============================================================================
-- 2076 — Vínculo real entre faturas de assinatura e cobranças do Asaas.
--
-- Problema:
--   Faturas de assinatura (company_invoices) não tinham nenhum identificador
--   do Asaas, então o webhook não conseguia saber QUAL empresa pagou.
--
-- Correções:
--   A) Colunas de cobrança na company_invoices (pix, customer, tipo, etc.).
--   B) companies.asaas_customer_id — cliente reutilizável no Asaas.
--   C) RPC mark_subscription_invoice_paid() — idempotente, usada pelo webhook:
--      encontra a fatura pelo asaas_payment_id (ou pelo id da fatura),
--      marca como paga e renova o ciclo da assinatura.
--   D) RPC mark_subscription_invoice_failed() — vencida/estornada.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Colunas extras em company_invoices
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_invoices
  ADD COLUMN IF NOT EXISTS asaas_payment_id  TEXT,
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_payload       TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code       TEXT,
  ADD COLUMN IF NOT EXISTS billing_period    TEXT,
  ADD COLUMN IF NOT EXISTS kind              TEXT NOT NULL DEFAULT 'subscription';

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invoices_asaas_payment
  ON public.company_invoices(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- B) Cliente Asaas reutilizável por empresa
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

-- ---------------------------------------------------------------------------
-- C) Marcar fatura de assinatura como paga (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_subscription_invoice_paid(
  _asaas_payment_id TEXT,
  _invoice_id       UUID DEFAULT NULL,
  _paid_at          TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv
    FROM public.company_invoices
   WHERE (_asaas_payment_id IS NOT NULL AND asaas_payment_id = _asaas_payment_id)
      OR (_invoice_id IS NOT NULL AND id = _invoice_id)
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  END IF;

  IF inv.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true,
                              'invoice_id', inv.id, 'company_id', inv.company_id);
  END IF;

  UPDATE public.company_invoices
     SET status           = 'paid',
         paid_at          = COALESCE(_paid_at, now()),
         asaas_payment_id = COALESCE(asaas_payment_id, _asaas_payment_id),
         updated_at       = now()
   WHERE id = inv.id;

  -- Renova o ciclo (libera recursos, abre próxima fatura).
  PERFORM public.renew_subscription_cycle(inv.company_id);

  -- Empresa em pending_payment passa a ativa.
  UPDATE public.companies
     SET status = 'active'
   WHERE id = inv.company_id
     AND COALESCE(status, '') IN ('pending_payment', 'suspended', 'blocked');

  RETURN jsonb_build_object('ok', true, 'invoice_id', inv.id,
                            'company_id', inv.company_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- D) Marcar fatura como vencida / estornada / falha
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_subscription_invoice_status(
  _asaas_payment_id TEXT,
  _status           TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  IF _status NOT IN ('pending','paid','overdue','cancelled','refunded','failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  SELECT * INTO inv FROM public.company_invoices
   WHERE asaas_payment_id = _asaas_payment_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  END IF;

  UPDATE public.company_invoices
     SET status = _status, updated_at = now()
   WHERE id = inv.id;

  IF _status IN ('overdue','failed','refunded') THEN
    PERFORM public.enforce_subscription_status(inv.company_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'invoice_id', inv.id,
                            'company_id', inv.company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_subscription_invoice_paid(TEXT, UUID, TIMESTAMPTZ)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_subscription_invoice_status(TEXT, TEXT)             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_subscription_invoice_paid(TEXT, UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_subscription_invoice_status(TEXT, TEXT)            TO service_role;

COMMIT;

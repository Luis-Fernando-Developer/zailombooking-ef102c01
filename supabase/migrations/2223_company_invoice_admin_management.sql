-- 2222: auditoria das operações administrativas de cobrança.
-- Mantém o histórico financeiro sem apagar faturas antigas.
ALTER TABLE public.company_invoices
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

CREATE TABLE IF NOT EXISTS public.company_invoice_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.company_invoices(id) ON DELETE SET NULL,
  actor_user_id UUID,
  action TEXT NOT NULL,
  previous_status TEXT,
  resulting_status TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_invoice_admin_audit_company_created
  ON public.company_invoice_admin_audit(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_invoice_admin_audit_invoice_created
  ON public.company_invoice_admin_audit(invoice_id, created_at DESC);

ALTER TABLE public.company_invoice_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_invoice_admin_audit FROM anon, authenticated;
GRANT ALL ON public.company_invoice_admin_audit TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 2079 — Cadastro com cobrança real no Asaas.
--
--  A) Preços canônicos dos planos (mensal / trimestral / anual) e nomes
--     padronizados (Starter, Professional, Enterprise).
--  B) companies.status precisa aceitar 'pending_payment'.
--  C) company_subscriptions.asaas_subscription_id — assinatura recorrente.
--  D) RPC pública signup_payment_status() — a tela /signup/aguardando/:id
--     roda como anônima e precisa ler status + dados da cobrança.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Preços canônicos
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_price   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS quarterly_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS annual_price    NUMERIC(10,2);

WITH canonical AS (
  SELECT * FROM (VALUES
    ('starter'::TEXT,      'Starter'::TEXT,       79.00::NUMERIC,  213.00::NUMERIC,  708.00::NUMERIC),
    ('professional'::TEXT, 'Professional'::TEXT, 149.00::NUMERIC,  402.00::NUMERIC, 1308.00::NUMERIC),
    ('enterprise'::TEXT,   'Enterprise'::TEXT,   249.00::NUMERIC,  672.00::NUMERIC, 2268.00::NUMERIC)
  ) AS v(plan_key, plan_name, monthly_price, quarterly_price, annual_price)
), resolved AS (
  SELECT DISTINCT ON (plan_key) plan_key, id
  FROM (
    SELECT
      CASE
        WHEN lower(coalesce(sp.name,'')) LIKE '%enterprise%'
          OR lower(coalesce(sp.name,'')) LIKE '%diamante%'
          OR lower(coalesce(sp.name,'')) LIKE '%business%' THEN 'enterprise'
        WHEN lower(coalesce(sp.name,'')) LIKE '%professional%'
          OR lower(coalesce(sp.name,'')) LIKE '%ouro%'
          OR lower(coalesce(sp.name,'')) LIKE '%pro%'      THEN 'professional'
        WHEN lower(coalesce(sp.name,'')) LIKE '%starter%'
          OR lower(coalesce(sp.name,'')) LIKE '%prata%'    THEN 'starter'
        ELSE NULL
      END AS plan_key,
      sp.id, sp.is_active, sp.monthly_price, sp.name
    FROM public.subscription_plans sp
  ) x
  WHERE plan_key IS NOT NULL
  ORDER BY plan_key, is_active DESC NULLS LAST, monthly_price ASC NULLS LAST, name ASC
)
UPDATE public.subscription_plans sp
   SET name            = c.plan_name,
       monthly_price   = c.monthly_price,
       quarterly_price = c.quarterly_price,
       annual_price    = c.annual_price
  FROM resolved r
  JOIN canonical c ON c.plan_key = r.plan_key
 WHERE sp.id = r.id;

-- ---------------------------------------------------------------------------
-- B) companies.status deve aceitar 'pending_payment'
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'companies'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.companies DROP CONSTRAINT %I', con.conname);
  END LOOP;

  ALTER TABLE public.companies
    ADD CONSTRAINT companies_status_chk
    CHECK (status IS NULL OR status IN
      ('active','pending_payment','suspended','blocked','paused','cancelled','inactive','trial'));
END $$;

-- ---------------------------------------------------------------------------
-- C) Assinatura recorrente do Asaas
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

-- ---------------------------------------------------------------------------
-- D) Status público do pagamento de cadastro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_payment_status(_company_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'company', jsonb_build_object(
      'id',     c.id,
      'name',   c.name,
      'slug',   c.slug,
      'status', c.status
    ),
    'invoice', (
      SELECT jsonb_build_object(
        'id',            i.id,
        'status',        i.status,
        'amount',        i.amount,
        'billing_type',  i.billing_type,
        'due_date',      i.due_date,
        'invoice_url',   i.invoice_url,
        'bank_slip_url', i.bank_slip_url,
        'pix_qr_code',   i.pix_qr_code,
        'pix_payload',   i.pix_payload
      )
      FROM public.company_invoices i
      WHERE i.company_id = c.id
      ORDER BY i.created_at DESC
      LIMIT 1
    )
  )
  FROM public.companies c
  WHERE c.id = _company_id;
$$;

REVOKE ALL ON FUNCTION public.signup_payment_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_payment_status(UUID) TO anon, authenticated, service_role;

COMMIT;

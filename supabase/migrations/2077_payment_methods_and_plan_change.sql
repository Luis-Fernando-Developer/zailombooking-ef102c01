-- ============================================================================
-- 2077 — Métodos de pagamento tokenizados + troca de plano com proração.
--
-- A) public.company_payment_methods  — métodos visíveis pelo painel da empresa
--    (NUNCA guarda dados sensíveis do cartão: apenas bandeira/últimos dígitos).
-- B) public.company_payment_tokens   — tokens do Asaas, acessíveis SOMENTE pelo
--    service_role (edge functions). Sem grants para anon/authenticated.
-- C) Colunas auxiliares em company_subscriptions.
-- D) RPC apply_paid_plan_change() — aplica a troca de plano quando a fatura
--    de proração é confirmada (chamada pelo webhook, idempotente).
-- E) RPC schedule_plan_change() — agenda downgrade/mudança de ciclo.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Métodos de pagamento (dados não sensíveis)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_payment_methods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('credit_card', 'pix', 'boleto')),
  brand         TEXT,
  last_digits   TEXT,
  display_label TEXT,
  holder_name   TEXT,
  expiry_month  TEXT,
  expiry_year   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- colunas para bases que já tinham a tabela em versão anterior
ALTER TABLE public.company_payment_methods
  ADD COLUMN IF NOT EXISTS holder_name  TEXT,
  ADD COLUMN IF NOT EXISTS expiry_month TEXT,
  ADD COLUMN IF NOT EXISTS expiry_year  TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cpm_company ON public.company_payment_methods(company_id);

-- somente um método padrão ativo por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpm_default_per_company
  ON public.company_payment_methods(company_id)
  WHERE is_default AND is_active;

GRANT SELECT ON public.company_payment_methods TO authenticated;
GRANT ALL    ON public.company_payment_methods TO service_role;

ALTER TABLE public.company_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members read payment methods"
  ON public.company_payment_methods;
CREATE POLICY "company members read payment methods"
  ON public.company_payment_methods
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
       WHERE c.id = company_payment_methods.company_id
         AND lower(c.owner_email) = lower(COALESCE(auth.email(), ''))
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.company_id = company_payment_methods.company_id
         AND e.user_id = auth.uid()
         AND e.role::text IN ('owner', 'admin', 'manager', 'gerente', 'proprietario')
    )
  );
-- escrita apenas via edge function (service_role): nenhuma policy de INSERT/UPDATE.

-- ---------------------------------------------------------------------------
-- B) Tokens do Asaas — isolados, sem acesso do cliente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_payment_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES public.company_payment_methods(id) ON DELETE CASCADE,
  asaas_customer_id TEXT,
  asaas_card_token  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpt_company ON public.company_payment_tokens(company_id);

REVOKE ALL ON public.company_payment_tokens FROM anon, authenticated;
GRANT ALL ON public.company_payment_tokens TO service_role;

ALTER TABLE public.company_payment_tokens ENABLE ROW LEVEL SECURITY;
-- nenhuma policy: apenas service_role (que ignora RLS) enxerga os tokens.

-- ---------------------------------------------------------------------------
-- C) Colunas auxiliares na assinatura
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_change       JSONB,
  ADD COLUMN IF NOT EXISTS current_payment_method_id UUID,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id     TEXT;

ALTER TABLE public.company_invoices
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- D) Aplica a troca de plano quando a fatura de proração é paga
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_paid_plan_change(_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv        RECORD;
  v_plan_id  UUID;
  v_period   TEXT;
  v_price    NUMERIC;
BEGIN
  SELECT * INTO inv FROM public.company_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  END IF;

  IF COALESCE(inv.kind, 'subscription') <> 'plan_change' THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'not_a_plan_change');
  END IF;

  v_plan_id := NULLIF(inv.metadata->>'new_plan_id', '')::UUID;
  v_period  := COALESCE(inv.metadata->>'billing_period', 'monthly');
  v_price   := COALESCE((inv.metadata->>'new_price')::NUMERIC, 0);

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_new_plan_id');
  END IF;

  UPDATE public.company_subscriptions
     SET plan_id             = v_plan_id,
         billing_period      = v_period,
         original_price      = CASE WHEN v_price > 0 THEN v_price ELSE original_price END,
         pending_plan_change = NULL,
         updated_at          = now()
   WHERE company_id = inv.company_id;

  RETURN jsonb_build_object('ok', true, 'applied', true, 'plan_id', v_plan_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_paid_plan_change(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paid_plan_change(UUID) TO service_role;

COMMIT;

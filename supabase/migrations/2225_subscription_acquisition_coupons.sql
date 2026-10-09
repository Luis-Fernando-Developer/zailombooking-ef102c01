-- Cupons de aquisição do Zailom Booking.
-- Exclusivo para a contratação da assinatura da plataforma; não afeta cupons de agendamento.
BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0),
  duration_type text NOT NULL DEFAULT 'first_payment' CHECK (duration_type IN ('first_payment', 'cycles')),
  duration_cycles integer NOT NULL DEFAULT 1 CHECK (duration_cycles >= 1),
  plan_ids uuid[] NOT NULL DEFAULT '{}',
  billing_periods text[] NOT NULL DEFAULT ARRAY['monthly','quarterly','annual']::text[],
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_coupons_code_uppercase CHECK (code = upper(trim(code))),
  CONSTRAINT subscription_coupons_periods_valid CHECK (billing_periods <@ ARRAY['monthly','quarterly','annual']::text[]),
  CONSTRAINT subscription_coupons_duration_valid CHECK (
    (duration_type = 'first_payment' AND duration_cycles = 1) OR duration_type = 'cycles'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_coupons_code_unique
  ON public.subscription_coupons (upper(code));

CREATE TABLE IF NOT EXISTS public.subscription_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.subscription_coupons(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.company_invoices(id) ON DELETE SET NULL,
  code text NOT NULL,
  plan_id uuid,
  billing_period text NOT NULL CHECK (billing_period IN ('monthly','quarterly','annual')),
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric(12,2) NOT NULL,
  original_amount numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL,
  discounted_amount numeric(12,2) NOT NULL,
  duration_cycles integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','applied','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, company_id)
);

CREATE INDEX IF NOT EXISTS subscription_coupon_redemptions_coupon_status_idx
  ON public.subscription_coupon_redemptions (coupon_id, status);

CREATE INDEX IF NOT EXISTS subscription_coupon_redemptions_company_idx
  ON public.subscription_coupon_redemptions (company_id, created_at DESC);

-- Dados do cupom vinculados à assinatura para manter as cobranças futuras coerentes.
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.subscription_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS coupon_discount_type text,
  ADD COLUMN IF NOT EXISTS coupon_discount_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS coupon_cycles_remaining integer NOT NULL DEFAULT 0;


ALTER TABLE public.subscription_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_coupons_super_admin_all ON public.subscription_coupons;
CREATE POLICY subscription_coupons_super_admin_all
  ON public.subscription_coupons
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS subscription_coupon_redemptions_super_admin_read ON public.subscription_coupon_redemptions;
CREATE POLICY subscription_coupon_redemptions_super_admin_read
  ON public.subscription_coupon_redemptions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_coupons TO authenticated;
GRANT SELECT ON public.subscription_coupon_redemptions TO authenticated;
GRANT ALL ON public.subscription_coupons TO service_role;
GRANT ALL ON public.subscription_coupon_redemptions TO service_role;

-- Validação + reserva atômica: impede ultrapassar o limite de usos em requisições simultâneas.
CREATE OR REPLACE FUNCTION public.reserve_subscription_coupon(
  _code text,
  _company_id uuid,
  _plan_id uuid,
  _billing_period text,
  _original_amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.subscription_coupons%ROWTYPE;
  used_count integer;
  v_discount numeric(12,2);
  v_due numeric(12,2);
  v_cycles integer;
  v_existing public.subscription_coupon_redemptions%ROWTYPE;
  v_has_existing boolean := false;
BEGIN
  IF _billing_period NOT IN ('monthly','quarterly','annual') THEN
    RAISE EXCEPTION 'Período de cobrança inválido.';
  END IF;
  IF _original_amount IS NULL OR _original_amount <= 0 THEN
    RAISE EXCEPTION 'Valor original inválido.';
  END IF;

  SELECT * INTO c
  FROM public.subscription_coupons
  WHERE code = upper(trim(_code))
  FOR UPDATE;

  IF NOT FOUND OR NOT c.is_active THEN
    RAISE EXCEPTION 'Cupom inválido ou inativo.';
  END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN
    RAISE EXCEPTION 'Este cupom ainda não está válido.';
  END IF;
  IF c.expires_at IS NOT NULL AND now() > c.expires_at THEN
    RAISE EXCEPTION 'Este cupom expirou.';
  END IF;
  IF cardinality(c.plan_ids) > 0 AND NOT (_plan_id = ANY(c.plan_ids)) THEN
    RAISE EXCEPTION 'Este cupom não é válido para o plano selecionado.';
  END IF;
  IF NOT (_billing_period = ANY(c.billing_periods)) THEN
    RAISE EXCEPTION 'Este cupom não é válido para o período selecionado.';
  END IF;

  SELECT * INTO v_existing
  FROM public.subscription_coupon_redemptions
  WHERE coupon_id = c.id AND company_id = _company_id;
  v_has_existing := FOUND;
  IF v_has_existing AND v_existing.status <> 'cancelled' THEN
    RETURN jsonb_build_object(
      'coupon_id', c.id, 'redemption_id', v_existing.id, 'code', c.code,
      'discount_type', v_existing.discount_type, 'discount_value', v_existing.discount_value,
      'original_amount', v_existing.original_amount, 'discount_amount', v_existing.discount_amount,
      'discounted_amount', v_existing.discounted_amount, 'duration_cycles', v_existing.duration_cycles,
      'duration_type', c.duration_type, 'already_reserved', true
    );
  END IF;

  IF c.max_redemptions IS NOT NULL THEN
    SELECT count(*)::integer INTO used_count
    FROM public.subscription_coupon_redemptions
    WHERE coupon_id = c.id AND status IN ('reserved','applied','paid');
    IF used_count >= c.max_redemptions THEN
      RAISE EXCEPTION 'Este cupom atingiu o limite de utilizações.';
    END IF;
  END IF;

  IF c.discount_type = 'percentage' THEN
    v_discount := round(_original_amount * least(c.discount_value, 100) / 100, 2);
  ELSE
    v_discount := least(_original_amount, c.discount_value);
  END IF;
  v_due := greatest(0, round(_original_amount - v_discount, 2));
  v_cycles := CASE WHEN c.duration_type = 'first_payment' THEN 1 ELSE c.duration_cycles END;

  IF v_has_existing THEN
    UPDATE public.subscription_coupon_redemptions
      SET code = c.code, plan_id = _plan_id, billing_period = _billing_period,
          discount_type = c.discount_type, discount_value = c.discount_value,
          original_amount = _original_amount, discount_amount = v_discount,
          discounted_amount = v_due, duration_cycles = v_cycles,
          status = 'reserved', updated_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;
  ELSE
    INSERT INTO public.subscription_coupon_redemptions (
      coupon_id, company_id, code, plan_id, billing_period, discount_type,
      discount_value, original_amount, discount_amount, discounted_amount, duration_cycles, status
    ) VALUES (
      c.id, _company_id, c.code, _plan_id, _billing_period, c.discount_type,
      c.discount_value, _original_amount, v_discount, v_due, v_cycles, 'reserved'
    ) RETURNING * INTO v_existing;
  END IF;

  RETURN jsonb_build_object(
    'coupon_id', c.id, 'redemption_id', v_existing.id, 'code', c.code,
    'discount_type', c.discount_type, 'discount_value', c.discount_value,
    'original_amount', _original_amount, 'discount_amount', v_discount,
    'discounted_amount', v_due, 'duration_cycles', v_cycles,
    'duration_type', c.duration_type, 'already_reserved', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_subscription_coupon(text, uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_subscription_coupon(text, uuid, uuid, text, numeric) TO service_role;


-- Ao confirmar uma fatura da assinatura, registra o uso pago e avança a duração
-- local do cupom. O gatilho é idempotente para atualizações repetidas da fatura.
CREATE OR REPLACE FUNCTION public.track_subscription_coupon_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.subscription_id IS NOT NULL THEN
    UPDATE public.subscription_coupon_redemptions
      SET status = 'paid', invoice_id = NEW.id, updated_at = now()
      WHERE subscription_id = NEW.subscription_id
        AND status IN ('reserved','applied');

    UPDATE public.company_subscriptions
      SET coupon_cycles_remaining = greatest(0, coalesce(coupon_cycles_remaining, 0) - 1)
      WHERE id = NEW.subscription_id
        AND coalesce(coupon_cycles_remaining, 0) > 0;
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS trg_track_subscription_coupon_payment ON public.company_invoices;
CREATE TRIGGER trg_track_subscription_coupon_payment
AFTER UPDATE OF status ON public.company_invoices
FOR EACH ROW
EXECUTE FUNCTION public.track_subscription_coupon_payment();

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cupons promocionais por empresa para pagamentos online de agendamentos.
-- Independente de subscription_coupons (cupons de aquisição da plataforma).
BEGIN;

CREATE TABLE IF NOT EXISTS public.company_service_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0 AND (discount_type <> 'percentage' OR discount_value <= 100)),
  apply_to_all boolean NOT NULL DEFAULT true,
  service_ids uuid[] NOT NULL DEFAULT '{}',
  combo_ids uuid[] NOT NULL DEFAULT '{}',
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_service_coupons_code_upper CHECK (code = upper(trim(code))),
  CONSTRAINT company_service_coupons_code_format CHECK (code ~ '^[A-Z0-9_-]{3,64}$'),
  CONSTRAINT company_service_coupons_dates CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
  CONSTRAINT company_service_coupons_scope CHECK (apply_to_all OR cardinality(service_ids) + cardinality(combo_ids) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS company_service_coupons_company_code_uq
  ON public.company_service_coupons(company_id, upper(code));
CREATE INDEX IF NOT EXISTS company_service_coupons_company_active_idx
  ON public.company_service_coupons(company_id, is_active);

CREATE TABLE IF NOT EXISTS public.company_service_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.company_service_coupons(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  checkout_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provider_payment_id text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  service_id uuid,
  combo_id uuid,
  original_amount numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL,
  final_amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','redeemed','cancelled')),
  reserved_until timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz
);
CREATE INDEX IF NOT EXISTS company_service_coupon_redemptions_usage_idx
  ON public.company_service_coupon_redemptions(coupon_id, status, reserved_until);
CREATE INDEX IF NOT EXISTS company_service_coupon_redemptions_payment_idx
  ON public.company_service_coupon_redemptions(provider_payment_id);

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS provider_payment_id text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS original_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS coupon_discount_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.company_service_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_service_coupon_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_service_coupons_company_manage ON public.company_service_coupons;
CREATE POLICY company_service_coupons_company_manage ON public.company_service_coupons
  FOR ALL TO authenticated
  USING (public.user_has_company_permission(company_id, 'settings.manage'))
  WITH CHECK (public.user_has_company_permission(company_id, 'settings.manage'));
DROP POLICY IF EXISTS company_service_coupon_redemptions_company_read ON public.company_service_coupon_redemptions;
CREATE POLICY company_service_coupon_redemptions_company_read ON public.company_service_coupon_redemptions
  FOR SELECT TO authenticated
  USING (public.user_has_company_permission(company_id, 'settings.manage'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_service_coupons TO authenticated;
GRANT SELECT ON public.company_service_coupon_redemptions TO authenticated;
GRANT ALL ON public.company_service_coupons, public.company_service_coupon_redemptions TO service_role;

-- Retorna o preço calculado no banco e o desconto, sem confiar no preço enviado pelo navegador.
CREATE OR REPLACE FUNCTION public.quote_company_service_coupon(
  p_company_id uuid,
  p_code text,
  p_service_id uuid DEFAULT NULL,
  p_combo_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.company_service_coupons%ROWTYPE;
  v_original numeric(12,2);
  v_discount numeric(12,2);
  v_final numeric(12,2);
  v_service jsonb;
  v_combo jsonb;
  v_used integer;
BEGIN
  IF (p_service_id IS NULL) = (p_combo_id IS NULL) THEN
    RAISE EXCEPTION 'Informe um serviço individual ou um combo.';
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT to_jsonb(s) INTO v_service
      FROM public.services s
     WHERE s.id = p_service_id AND s.company_id = p_company_id
       AND COALESCE((to_jsonb(s)->>'is_active')::boolean, true);
    IF v_service IS NULL THEN RAISE EXCEPTION 'Serviço indisponível para esta empresa.'; END IF;
    v_original := NULLIF(v_service->>'price','')::numeric;
  ELSE
    SELECT to_jsonb(cb) INTO v_combo
      FROM public.service_combos cb
     WHERE cb.id = p_combo_id AND cb.company_id = p_company_id
       AND COALESCE((to_jsonb(cb)->>'is_active')::boolean, true);
    IF v_combo IS NULL THEN RAISE EXCEPTION 'Combo indisponível para esta empresa.'; END IF;
    v_original := COALESCE(NULLIF(v_combo->>'price','')::numeric, NULLIF(v_combo->>'combo_price','')::numeric);
  END IF;
  IF v_original IS NULL OR v_original <= 0 THEN RAISE EXCEPTION 'O preço do item é inválido para aplicar cupom.'; END IF;

  SELECT * INTO c FROM public.company_service_coupons
   WHERE company_id = p_company_id AND code = upper(trim(p_code));
  IF NOT FOUND OR NOT c.is_active THEN RAISE EXCEPTION 'Cupom inválido ou inativo.'; END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN RAISE EXCEPTION 'Este cupom ainda não está válido.'; END IF;
  IF c.expires_at IS NOT NULL AND now() > c.expires_at THEN RAISE EXCEPTION 'Este cupom expirou.'; END IF;
  IF NOT c.apply_to_all AND NOT (
    (p_service_id IS NOT NULL AND p_service_id = ANY(c.service_ids)) OR
    (p_combo_id IS NOT NULL AND p_combo_id = ANY(c.combo_ids))
  ) THEN RAISE EXCEPTION 'Este cupom não é válido para o serviço ou combo selecionado.'; END IF;
  IF c.max_redemptions IS NOT NULL THEN
    SELECT count(*)::integer INTO v_used
      FROM public.company_service_coupon_redemptions r
     WHERE r.coupon_id = c.id
       AND (r.status = 'redeemed' OR (r.status = 'reserved' AND r.reserved_until > now()));
    IF v_used >= c.max_redemptions THEN RAISE EXCEPTION 'Este cupom atingiu o limite de utilizações.'; END IF;
  END IF;

  IF c.discount_type = 'percentage' THEN
    v_discount := round(v_original * least(c.discount_value, 100) / 100, 2);
  ELSE
    v_discount := least(v_original, c.discount_value);
  END IF;
  v_final := greatest(0, round(v_original - v_discount, 2));
  IF v_final <= 0 THEN RAISE EXCEPTION 'O desconto não pode zerar o pagamento online.'; END IF;
  RETURN jsonb_build_object(
    'coupon_id', c.id, 'code', c.code, 'discount_type', c.discount_type,
    'discount_value', c.discount_value, 'original_amount', v_original,
    'discount_amount', v_discount, 'discounted_amount', v_final
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_company_service_coupon(
  p_company_id uuid, p_code text, p_service_id uuid DEFAULT NULL, p_combo_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.quote_company_service_coupon(p_company_id, p_code, p_service_id, p_combo_id); $$;

CREATE OR REPLACE FUNCTION public.reserve_company_service_coupon(
  p_company_id uuid, p_code text, p_service_id uuid DEFAULT NULL, p_combo_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.company_service_coupons%ROWTYPE;
  v_quote jsonb;
  v_used integer;
  v_redemption public.company_service_coupon_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_coupon FROM public.company_service_coupons
   WHERE company_id = p_company_id AND code = upper(trim(p_code))
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cupom inválido ou inativo.'; END IF;

  v_quote := public.quote_company_service_coupon(p_company_id, p_code, p_service_id, p_combo_id);
  IF v_coupon.max_redemptions IS NOT NULL THEN
    SELECT count(*)::integer INTO v_used
      FROM public.company_service_coupon_redemptions
     WHERE coupon_id = v_coupon.id
       AND (status = 'redeemed' OR (status = 'reserved' AND reserved_until > now()));
    IF v_used >= v_coupon.max_redemptions THEN RAISE EXCEPTION 'Este cupom atingiu o limite de utilizações.'; END IF;
  END IF;

  INSERT INTO public.company_service_coupon_redemptions(
    coupon_id, company_id, code, service_id, combo_id, original_amount, discount_amount, final_amount
  ) VALUES (
    v_coupon.id, p_company_id, v_coupon.code, p_service_id, p_combo_id,
    (v_quote->>'original_amount')::numeric, (v_quote->>'discount_amount')::numeric,
    (v_quote->>'discounted_amount')::numeric
  ) RETURNING * INTO v_redemption;
  RETURN v_quote || jsonb_build_object('checkout_token', v_redemption.checkout_token, 'redemption_id', v_redemption.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_company_service_coupon(
  p_checkout_token uuid, p_provider_payment_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.company_service_coupon_redemptions
     SET provider_payment_id = p_provider_payment_id,
         reserved_until = now() + interval '24 hours'
   WHERE checkout_token = p_checkout_token AND status = 'reserved';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.quote_company_service_coupon(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_company_service_coupon(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_company_service_coupon(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_company_service_coupon(uuid,text,uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_company_service_coupon(uuid,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_company_service_coupon(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.track_company_service_coupon_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(COALESCE(NEW.status::text,'')) IN ('paid','confirmed','received')
     AND lower(COALESCE(OLD.status::text,'')) NOT IN ('paid','confirmed','received') THEN
    UPDATE public.company_service_coupon_redemptions
       SET status = 'redeemed', redeemed_at = now(), booking_id = COALESCE(NEW.booking_id, booking_id)
     WHERE provider_payment_id = COALESCE(NEW.provider_payment_id, NEW.asaas_id) AND status = 'reserved';
  ELSIF lower(COALESCE(NEW.status::text,'')) IN ('cancelled','canceled','refunded','deleted') THEN
    UPDATE public.company_service_coupon_redemptions
       SET status = 'cancelled'
     WHERE provider_payment_id = COALESCE(NEW.provider_payment_id, NEW.asaas_id) AND status = 'reserved';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.track_company_service_coupon_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_track_company_service_coupon_payment ON public.booking_payments;
CREATE TRIGGER trg_track_company_service_coupon_payment
AFTER UPDATE OF status ON public.booking_payments
FOR EACH ROW EXECUTE FUNCTION public.track_company_service_coupon_payment();

-- Preserva combos e os dados do desconto no booking criado após pagamento online.
CREATE OR REPLACE FUNCTION public.confirm_online_booking_payment(
  p_hold_id uuid, p_payment_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.booking_slot_holds%ROWTYPE;
  v_booking_id uuid;
  v_payment public.booking_payments%ROWTYPE;
  v_is_service_role boolean := COALESCE(auth.role(), '') = 'service_role';
  v_booking_data jsonb;
  v_combo_id uuid;
BEGIN
  IF auth.uid() IS NULL AND NOT v_is_service_role THEN RAISE EXCEPTION 'Sessão não autenticada.'; END IF;
  SELECT * INTO v_payment FROM public.booking_payments WHERE provider_payment_id = p_payment_id OR asaas_id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
  IF v_payment.booking_id IS NOT NULL THEN RETURN v_payment.booking_id; END IF;
  SELECT * INTO v_hold FROM public.booking_slot_holds WHERE id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hold de horário inválido.'; END IF;
  IF NOT v_is_service_role AND v_hold.client_id NOT IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Hold de horário inválido.';
  END IF;
  IF v_hold.status <> 'active' OR v_hold.expires_at <= now() THEN
    UPDATE public.booking_slot_holds SET status = 'expired', updated_at = now() WHERE id = v_hold.id;
    RAISE EXCEPTION USING MESSAGE = 'O tempo para concluir a reserva acabou. O horário foi liberado.', DETAIL = 'hold_expired', ERRCODE = 'P0001';
  END IF;
  IF v_payment.company_id <> v_hold.company_id
     OR COALESCE((v_payment.metadata->>'client_id'), '') <> v_hold.client_id::text THEN
    RAISE EXCEPTION 'Pagamento não corresponde ao hold do cliente.';
  END IF;
  IF lower(COALESCE(v_payment.status::text,'')) NOT IN ('paid','confirmed','received') THEN
    RAISE EXCEPTION 'Pagamento ainda não confirmado.';
  END IF;
  v_booking_data := COALESCE(v_payment.metadata->'booking_data','{}'::jsonb);
  v_combo_id := NULLIF(v_booking_data->>'combo_id','')::uuid;

  INSERT INTO public.bookings (
    company_id, employee_id, service_id, combo_id, client_id,
    booking_time, start_time, end_time, booking_date, duration_minutes, price,
    original_price, coupon_code, coupon_discount_amount, notes, created_source,
    booking_status, payment_status, payment_method
  ) VALUES (
    v_hold.company_id, v_hold.employee_id,
    CASE WHEN v_combo_id IS NULL THEN v_hold.service_id ELSE NULL END,
    v_combo_id, v_hold.client_id, v_hold.booking_time, v_hold.start_time, v_hold.end_time, v_hold.booking_date,
    GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_hold.end_time - v_hold.start_time)) / 60)::INT),
    v_payment.amount,
    NULLIF(v_payment.metadata->>'original_amount','')::numeric,
    NULLIF(v_payment.metadata->>'coupon_code',''),
    COALESCE(NULLIF(v_payment.metadata->>'coupon_discount_amount','')::numeric,0),
    COALESCE((v_booking_data->>'notes'),''), 'landingpage', 'confirmed', 'confirmed', 'online'
  ) RETURNING id INTO v_booking_id;

  UPDATE public.booking_payments SET booking_id = v_booking_id, status = 'confirmed', updated_at = now() WHERE id = v_payment.id;
  UPDATE public.booking_slot_holds SET status = 'converted', updated_at = now() WHERE id = v_hold.id;
  UPDATE public.company_service_coupon_redemptions SET booking_id = v_booking_id
   WHERE provider_payment_id = COALESCE(v_payment.provider_payment_id, v_payment.asaas_id) AND status IN ('reserved','redeemed');
  RETURN v_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_online_booking_payment(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_online_booking_payment(uuid,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

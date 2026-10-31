-- 2252 — permitir que a public-api conclua holds usando sua credencial service_role.
-- A public-api autentica a API key da empresa e valida o company_id do hold.
-- A RPC deve aceitar service_role sem exigir auth.uid(), mantendo a validação
-- de propriedade do cliente para chamadas feitas por usuários autenticados.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_online_booking_payment(
  p_hold_id UUID,
  p_payment_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.booking_slot_holds%ROWTYPE;
  v_booking_id UUID;
  v_payment public.booking_payments%ROWTYPE;
  v_is_service_role BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  SELECT *
    INTO v_payment
    FROM public.booking_payments
   WHERE provider_payment_id = p_payment_id
      OR asaas_id::TEXT = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;

  IF v_payment.booking_id IS NOT NULL THEN
    RETURN v_payment.booking_id;
  END IF;

  SELECT * INTO v_hold
    FROM public.booking_slot_holds
   WHERE id = p_hold_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold de horário inválido.';
  END IF;

  -- Usuários autenticados só podem concluir holds dos próprios cadastros.
  -- service_role é aceito porque a public-api já validou a API key e a empresa.
  IF NOT v_is_service_role AND NOT EXISTS (
    SELECT 1
      FROM public.clients
     WHERE id = v_hold.client_id
       AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Hold de horário inválido.';
  END IF;

  IF v_hold.status <> 'active' OR v_hold.expires_at <= now() THEN
    UPDATE public.booking_slot_holds
       SET status = 'expired', updated_at = now()
     WHERE id = v_hold.id;
    RAISE EXCEPTION USING
      MESSAGE = 'O tempo para concluir a reserva acabou. O horário foi liberado.',
      DETAIL = 'hold_expired',
      ERRCODE = 'P0001';
  END IF;

  IF v_payment.company_id <> v_hold.company_id
     OR COALESCE((v_payment.metadata->>'client_id'), '') <> v_hold.client_id::TEXT THEN
    RAISE EXCEPTION 'Pagamento não corresponde ao hold do cliente.';
  END IF;

  IF LOWER(COALESCE(v_payment.status::TEXT,'')) NOT IN ('paid','confirmed','received') THEN
    RAISE EXCEPTION 'Pagamento ainda não confirmado.';
  END IF;

  INSERT INTO public.bookings (
    company_id, employee_id, service_id, client_id,
    booking_time, start_time, end_time, booking_date,
    duration_minutes, price, notes, created_source,
    booking_status, payment_status, payment_method
  )
  VALUES (
    v_hold.company_id, v_hold.employee_id, v_hold.service_id, v_hold.client_id,
    v_hold.booking_time, v_hold.start_time, v_hold.end_time, v_hold.booking_date,
    GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_hold.end_time - v_hold.start_time)) / 60)::INT),
    v_payment.amount,
    COALESCE((v_payment.metadata->'booking_data'->>'notes'), ''),
    'landingpage', 'confirmed', 'confirmed', 'online'
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.booking_payments
     SET booking_id = v_booking_id,
         status = 'confirmed',
         updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.booking_slot_holds
     SET status = 'converted', updated_at = now()
   WHERE id = v_hold.id;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_online_booking_payment(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_online_booking_payment(UUID,TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

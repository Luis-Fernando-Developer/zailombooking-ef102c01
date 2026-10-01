-- 2203 — permitir que a Public API execute o checkout online pelas RPCs canônicas
-- A Public API já autentica a empresa pela API key e usa service_role internamente.
-- Mantemos as mesmas regras de negócio de 2182; apenas permitimos a chamada
-- trusted service_role sem exigir auth.uid().
BEGIN;

CREATE OR REPLACE FUNCTION public.create_online_booking_hold(
  p_company_id UUID,
  p_employee_id UUID,
  p_service_id UUID,
  p_client_id UUID,
  p_booking_date DATE,
  p_booking_time TIME,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_hold_minutes INTEGER DEFAULT 10
)
RETURNS TABLE(hold_id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.booking_slot_holds%ROWTYPE;
  v_expires TIMESTAMPTZ;
  v_available BOOLEAN;
  v_is_service_role BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF NOT v_is_service_role AND NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id
      AND company_id = p_company_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cliente inválido para esta sessão.';
  END IF;

  IF p_hold_minutes < 1 OR p_hold_minutes > 30 THEN
    RAISE EXCEPTION 'Tempo de hold inválido.';
  END IF;

  v_expires := now() + make_interval(mins => p_hold_minutes);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', p_company_id::TEXT, p_employee_id::TEXT, p_booking_date::TEXT),
      0
    )
  );

  UPDATE public.booking_slot_holds
     SET status = 'expired', updated_at = now()
   WHERE company_id = p_company_id
     AND employee_id = p_employee_id
     AND status = 'active'
     AND expires_at <= now();

  SELECT * INTO v_hold
    FROM public.booking_slot_holds
   WHERE company_id = p_company_id
     AND employee_id = p_employee_id
     AND booking_date = p_booking_date
     AND booking_time = p_booking_time
     AND client_id = p_client_id
     AND status = 'active'
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT v_hold.id, v_hold.expires_at;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.get_available_slots(
        p_company_id, p_employee_id, p_service_id, p_booking_date, FALSE
      ) s
     WHERE s.slot = p_booking_time
  ) INTO v_available;

  IF NOT v_available THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Esse horário acabou de ser reservado por outra pessoa.',
      DETAIL = 'slot_already_held',
      ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.booking_slot_holds (
    company_id, employee_id, service_id, client_id,
    booking_date, booking_time, start_time, end_time,
    status, expires_at
  )
  VALUES (
    p_company_id, p_employee_id, p_service_id, p_client_id,
    p_booking_date, p_booking_time, p_start_time, p_end_time,
    'active', v_expires
  )
  RETURNING * INTO v_hold;

  RETURN QUERY SELECT v_hold.id, v_hold.expires_at;
END;
$$;

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

  SELECT * INTO v_payment
    FROM public.booking_payments
   WHERE asaas_id = p_payment_id
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

  IF NOT v_is_service_role AND v_hold.client_id NOT IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
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

REVOKE ALL ON FUNCTION public.create_online_booking_hold(UUID,UUID,UUID,UUID,DATE,TIME,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_online_booking_hold(UUID,UUID,UUID,UUID,DATE,TIME,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_online_booking_payment(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_online_booking_payment(UUID,TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

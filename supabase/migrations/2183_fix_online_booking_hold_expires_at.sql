-- 2183 — Corrige referência ambígua expires_at no hold online
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF NOT EXISTS (
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

  UPDATE public.booking_slot_holds AS h
     SET status = 'expired',
         updated_at = now()
   WHERE h.company_id = p_company_id
     AND h.employee_id = p_employee_id
     AND h.status = 'active'
     AND h.expires_at <= now();

  SELECT * INTO v_hold
    FROM public.booking_slot_holds AS h
   WHERE h.company_id = p_company_id
     AND h.employee_id = p_employee_id
     AND h.booking_date = p_booking_date
     AND h.booking_time = p_booking_time
     AND h.client_id = p_client_id
     AND h.status = 'active'
     AND h.expires_at > now()
   ORDER BY h.created_at DESC
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
      ) AS s
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

REVOKE ALL ON FUNCTION public.create_online_booking_hold(UUID,UUID,UUID,UUID,DATE,TIME,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_online_booking_hold(UUID,UUID,UUID,UUID,DATE,TIME,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

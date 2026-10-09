-- ============================================================================
-- 2045 — Reagendamento do cliente: valida pelo mesmo calendário exibido na UI
--
-- Sintoma: o cliente escolhe qualquer horário listado como disponível, mas a
-- confirmação retorna P0001/slot_unavailable.
--
-- Causa: client_reschedule_booking passou a validar pelo is_slot_available,
-- enquanto a tela mostra horários vindos de get_available_slots. Depois dos
-- hotfixes de realocação, as duas funções ficaram com regras divergentes
-- (ex.: business_hours/ausências/fuso), então a UI oferecia o horário e o RPC
-- rejeitava na confirmação.
--
-- Correção: o RPC volta a usar get_available_slots como fonte de verdade para
-- aceitar exatamente os horários que a tela oferece. Mantém a checagem
-- transacional de conflito ignorando o próprio agendamento para proteger contra
-- corrida entre listar horários e confirmar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.client_reschedule_booking(
  p_booking_id uuid,
  p_new_date date,
  p_new_start time,
  p_new_employee uuid DEFAULT NULL,
  p_new_service uuid DEFAULT NULL
) RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.bookings;
  v_new public.bookings;
  v_duration int;
  v_end time;
  v_emp uuid;
  v_svc uuid;
  v_slot_exists boolean;
  v_start_type text;
BEGIN
  SELECT b.* INTO v_old
    FROM public.bookings b
    JOIN public.clients c ON c.id = b.client_id
   WHERE b.id = p_booking_id
     AND c.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF LOWER(COALESCE(v_old.booking_status::TEXT, '')) IN ('completed', 'cancelled', 'canceled', 'in_progress') THEN
    RAISE EXCEPTION 'booking_locked';
  END IF;

  v_emp := COALESCE(p_new_employee, v_old.employee_id);
  v_svc := COALESCE(p_new_service, v_old.service_id);

  SELECT COALESCE(duration_minutes, 30)
    INTO v_duration
    FROM public.services
   WHERE id = v_svc
     AND company_id = v_old.company_id;

  IF v_duration IS NULL THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  v_end := (p_new_start::INTERVAL + (v_duration || ' min')::INTERVAL)::TIME;

  SELECT EXISTS (
    SELECT 1
      FROM public.get_available_slots(v_old.company_id, v_emp, v_svc, p_new_date) s
     WHERE s.slot IS NOT NULL
       AND s.slot = p_new_start
  ) INTO v_slot_exists;

  IF NOT COALESCE(v_slot_exists, FALSE) THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.bookings b2
     WHERE b2.company_id = v_old.company_id
       AND b2.employee_id = v_emp
       AND b2.booking_date = p_new_date
       AND b2.id <> p_booking_id
       AND LOWER(COALESCE(b2.booking_status::TEXT, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'no_show')
       AND (p_new_start, v_end) OVERLAPS (
             b2.start_time::TIME,
             COALESCE(
               b2.end_time::TIME,
               b2.start_time::TIME + (COALESCE(b2.duration_minutes, 30) || ' min')::INTERVAL
             )
           )
  ) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;

  SELECT c.data_type
    INTO v_start_type
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'bookings'
     AND c.column_name = 'start_time'
   LIMIT 1;

  IF v_start_type IN ('timestamp with time zone', 'timestamp without time zone') THEN
    EXECUTE $sql$
      UPDATE public.bookings
         SET booking_date = $2,
             start_time = ($2::DATE + $3::TIME),
             end_time = ($2::DATE + $4::TIME),
             employee_id = $5,
             service_id = $6,
             booking_status = CASE
               WHEN LOWER(COALESCE($7::TEXT, '')) = 'no_show' THEN 'confirmed'
               ELSE booking_status
             END,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *
    $sql$
    INTO v_new
    USING p_booking_id, p_new_date, p_new_start, v_end, v_emp, v_svc, v_old.booking_status;
  ELSE
    UPDATE public.bookings
       SET booking_date = p_new_date,
           start_time = p_new_start,
           end_time = v_end,
           employee_id = v_emp,
           service_id = v_svc,
           booking_status = CASE
             WHEN LOWER(COALESCE(v_old.booking_status::TEXT, '')) = 'no_show' THEN 'confirmed'
             ELSE booking_status
           END,
           updated_at = NOW()
     WHERE id = p_booking_id
     RETURNING * INTO v_new;
  END IF;

  INSERT INTO public.booking_history(booking_id, changed_by, change_type, old_data, new_data)
  VALUES (p_booking_id, auth.uid(), 'reschedule', to_jsonb(v_old), to_jsonb(v_new));

  RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION public.client_reschedule_booking(uuid,date,time,uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 2050 — Corrige divergência entre get_available_slots e is_slot_available.
--
-- Sintoma:
--   GET /v1/availability/slots retornava 10:00 disponível em domingo, mas
--   POST /v1/bookings retornava 409 slot_unavailable para o mesmo horário.
--
-- Causa:
--   get_available_slots usa EXTRACT(DOW)  -> domingo = 0
--   is_slot_available usava EXTRACT(ISODOW) -> domingo = 7
--   Como business_hours.day_of_week segue o mesmo padrão usado pelo calendário
--   público (0..6), o gate de escrita consultava outro dia da semana.
--
-- Solução:
--   is_slot_available passa a usar EXTRACT(DOW), igual ao SSOT de leitura.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_slot_available(
  p_company         UUID,
  p_employee        UUID,
  p_service         UUID,
  p_date            DATE,
  p_start           TIME,
  p_ignore_booking  UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dow      INT  := EXTRACT(DOW FROM p_date)::INT;
  v_emp      public.employees%ROWTYPE;
  v_entry    public.schedule_entries%ROWTYPE;
  v_duration INT;
  v_end      TIME;
BEGIN
  SELECT COALESCE(duration_minutes,30) INTO v_duration FROM public.services WHERE id = p_service;
  IF v_duration IS NULL THEN RETURN FALSE; END IF;
  v_end := (p_start::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee AND company_id = p_company;
  IF NOT FOUND OR v_emp.is_active = FALSE THEN RETURN FALSE; END IF;
  IF v_emp.termination_effective_date IS NOT NULL
     AND p_date >= v_emp.termination_effective_date THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.employee_absences a
              WHERE a.employee_id = p_employee
                AND p_date BETWEEN a.start_date AND a.end_date) THEN RETURN FALSE; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.business_hours
                  WHERE company_id = p_company AND day_of_week = v_dow
                    AND COALESCE(is_open, TRUE) = TRUE) THEN RETURN FALSE; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schedules
                  WHERE tenant_id = p_company AND status IN ('approved','partially_approved')
                    AND p_date BETWEEN period_start AND period_end) THEN RETURN FALSE; END IF;

  SELECT se.* INTO v_entry FROM public.schedule_entries se
    JOIN public.schedules s ON s.id = se.schedule_id
   WHERE se.employee_id = p_employee AND se.entry_date = p_date
     AND s.tenant_id = p_company AND s.status IN ('approved','partially_approved')
   ORDER BY se.updated_at DESC LIMIT 1;
  IF NOT FOUND OR v_entry.entry_type <> 'T'
     OR v_entry.start_time IS NULL OR v_entry.end_time IS NULL THEN RETURN FALSE; END IF;

  IF p_start < v_entry.start_time OR v_end > v_entry.end_time THEN RETURN FALSE; END IF;

  IF v_entry.break_start IS NOT NULL AND v_entry.break_end IS NOT NULL
     AND p_start < v_entry.break_end AND v_end > v_entry.break_start THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.employee_breaks b
              WHERE b.company_id = p_company AND b.employee_id = p_employee
                AND b.weekdays @> ARRAY[v_dow]
                AND p_start < COALESCE(b.end_time, b.window_end)
                AND v_end   > COALESCE(b.start_time, b.window_start)) THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.blocked_slots bs
              WHERE bs.employee_id = p_employee
                AND (p_start, v_end) OVERLAPS (bs.start_time::TIME, bs.end_time::TIME)) THEN RETURN FALSE; END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings bk
     WHERE bk.company_id = p_company AND bk.employee_id = p_employee
       AND bk.booking_date = p_date
       AND (p_ignore_booking IS NULL OR bk.id <> p_ignore_booking)
       AND LOWER(COALESCE(bk.booking_status::text,'')) NOT IN ('cancelled','canceled','rejected','no_show')
       AND (p_start, v_end) OVERLAPS (
             ((bk.start_time AT TIME ZONE 'America/Sao_Paulo'))::TIME,
             COALESCE(
               ((bk.end_time AT TIME ZONE 'America/Sao_Paulo'))::TIME,
               (((bk.start_time AT TIME ZONE 'America/Sao_Paulo'))::TIME
                  + (COALESCE(bk.duration_minutes,30)||' min')::INTERVAL)
             )
           )
  ) THEN RETURN FALSE; END IF;

  RETURN TRUE;
END $$;

GRANT EXECUTE ON FUNCTION public.is_slot_available(uuid,uuid,uuid,date,time,uuid)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
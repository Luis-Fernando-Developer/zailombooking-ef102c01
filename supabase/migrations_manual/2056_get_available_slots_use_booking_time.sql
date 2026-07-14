-- ============================================================================
-- 2056 — Corrige vazamento de slots já reservados em get_available_slots.
--
-- Sintoma:
--   Após criar um agendamento (via bot/API, painel admin ou página pública),
--   o horário reservado continua aparecendo em GET /v1/availability/slots.
--
-- Causa:
--   A versão vigente de public.get_available_slots (migração 2042) filtra
--   bookings existentes com "bk.start_time::TIME", que interpreta o
--   timestamptz na TZ da sessão (UTC no PostgREST/Supabase). Um agendamento
--   gravado como 2026-07-15 14:00-03 vira 17:00 UTC → OVERLAPS nunca casa com
--   o slot local (14:00, 14:30) e o horário continua "livre".
--
--   is_slot_available já foi corrigida na 2044 usando AT TIME ZONE
--   'America/Sao_Paulo', mas o gerador de slots ficou pra trás.
--
-- Correção:
--   1) Usar bookings.booking_time (fonte de verdade local, populada pelo
--      trigger da 2054) quando disponível.
--   2) Fallback para start_time/end_time convertidos ao fuso de negócio
--      (America/Sao_Paulo) — nunca ::TIME direto.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_date     DATE
) RETURNS TABLE(slot TIME, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow             INT := EXTRACT(ISODOW FROM p_date)::INT;
  v_emp             public.employees%ROWTYPE;
  v_entry           public.schedule_entries%ROWTYPE;
  v_duration        INT;
  v_step            INT := 30;
  v_cur             TIME;
  v_slot_end        TIME;
  v_bh_open         TIME;
  v_bh_close        TIME;
  v_max_advance     INT;
  v_advance_limit   DATE;
BEGIN
  IF p_date < CURRENT_DATE THEN
    slot := NULL; reason := 'past_date'; RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE((booking_settings->>'advance_booking_days')::INT, 30)
    INTO v_max_advance
    FROM public.companies WHERE id = p_company;
  v_advance_limit := CURRENT_DATE + COALESCE(v_max_advance, 30);
  IF p_date > v_advance_limit THEN
    slot := NULL; reason := 'beyond_max_advance'; RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(duration_minutes, 30) INTO v_duration
    FROM public.services WHERE id = p_service AND company_id = p_company;
  IF v_duration IS NULL THEN
    slot := NULL; reason := 'service_not_found'; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_emp FROM public.employees
   WHERE id = p_employee AND company_id = p_company;
  IF NOT FOUND OR v_emp.is_active = FALSE THEN
    slot := NULL; reason := 'employee_not_found'; RETURN NEXT; RETURN;
  END IF;
  IF v_emp.termination_effective_date IS NOT NULL
     AND p_date >= v_emp.termination_effective_date THEN
    slot := NULL; reason := 'terminated'; RETURN NEXT; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.employee_absences a
              WHERE a.employee_id = p_employee
                AND p_date BETWEEN a.start_date AND a.end_date) THEN
    slot := NULL; reason := 'absence'; RETURN NEXT; RETURN;
  END IF;

  SELECT open_time, close_time INTO v_bh_open, v_bh_close
    FROM public.business_hours
   WHERE company_id = p_company AND day_of_week = v_dow
     AND COALESCE(is_closed, FALSE) = FALSE;
  IF NOT FOUND THEN
    slot := NULL; reason := 'company_closed'; RETURN NEXT; RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schedules
                  WHERE tenant_id = p_company
                    AND status IN ('approved','partially_approved')
                    AND p_date BETWEEN period_start AND period_end) THEN
    slot := NULL; reason := 'no_schedule_published'; RETURN NEXT; RETURN;
  END IF;

  SELECT se.* INTO v_entry FROM public.schedule_entries se
    JOIN public.schedules s ON s.id = se.schedule_id
   WHERE se.employee_id = p_employee AND se.entry_date = p_date
     AND s.tenant_id = p_company AND s.status IN ('approved','partially_approved')
   ORDER BY se.updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    slot := NULL; reason := 'no_entry'; RETURN NEXT; RETURN;
  END IF;
  IF v_entry.entry_type <> 'T' THEN
    slot := NULL; reason := 'off_' || v_entry.entry_type; RETURN NEXT; RETURN;
  END IF;
  IF v_entry.start_time IS NULL OR v_entry.end_time IS NULL THEN
    slot := NULL; reason := 'no_entry'; RETURN NEXT; RETURN;
  END IF;

  v_cur := GREATEST(v_entry.start_time, v_bh_open);
  WHILE v_cur + (v_duration || ' min')::INTERVAL <= LEAST(v_entry.end_time, v_bh_close) LOOP
    v_slot_end := (v_cur::INTERVAL + (v_duration || ' min')::INTERVAL)::TIME;

    IF v_entry.break_start IS NOT NULL AND v_entry.break_end IS NOT NULL
       AND v_cur < v_entry.break_end AND v_slot_end > v_entry.break_start THEN
      v_cur := (v_cur::INTERVAL + (v_step || ' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.employee_breaks b
       WHERE b.company_id = p_company
         AND b.employee_id = p_employee
         AND b.weekdays @> ARRAY[v_dow]
         AND v_cur < COALESCE(b.end_time, b.window_end)
         AND v_slot_end > COALESCE(b.start_time, b.window_start)
    ) THEN
      v_cur := (v_cur::INTERVAL + (v_step || ' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.blocked_slots bs
       WHERE bs.company_id = p_company
         AND (bs.employee_id IS NULL OR bs.employee_id = p_employee)
         AND tstzrange(bs.start_datetime::TIMESTAMPTZ, bs.end_datetime::TIMESTAMPTZ, '[)')
             && tstzrange((p_date + v_cur)::TIMESTAMPTZ, (p_date + v_slot_end)::TIMESTAMPTZ, '[)')
    ) THEN
      v_cur := (v_cur::INTERVAL + (v_step || ' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    -- Conflito com bookings existentes.
    -- Usa booking_time (TIME literal local) quando disponível; caso contrário
    -- converte start_time/end_time para America/Sao_Paulo. NUNCA usa ::TIME
    -- direto no timestamptz (a sessão vem em UTC).
    IF EXISTS (
      SELECT 1
        FROM public.bookings bk
       WHERE bk.company_id = p_company
         AND bk.employee_id = p_employee
         AND bk.booking_date = p_date
         AND LOWER(COALESCE(bk.booking_status::TEXT, '')) NOT IN ('cancelled','canceled','rejected','no_show')
         AND (v_cur, v_slot_end) OVERLAPS (
               COALESCE(
                 bk.booking_time,
                 (bk.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME
               ),
               COALESCE(
                 (bk.end_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
                 COALESCE(
                   bk.booking_time,
                   (bk.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME
                 ) + (COALESCE(bk.duration_minutes, 30) || ' min')::INTERVAL
               )
             )
    ) THEN
      v_cur := (v_cur::INTERVAL + (v_step || ' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    slot := v_cur;
    reason := NULL;
    RETURN NEXT;
    v_cur := (v_cur::INTERVAL + (v_step || ' min')::INTERVAL)::TIME;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, UUID, UUID, DATE)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

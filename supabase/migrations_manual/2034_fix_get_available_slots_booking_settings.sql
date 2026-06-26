-- ============================================================================
-- 2034 — Corrige get_available_slots para ler de companies.booking_settings
-- Remove dependência da tabela inexistente public.company_schedule_settings
-- Também permite chamada direta via RPC pelo frontend público, sem Edge Function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_date     DATE
) RETURNS TABLE(slot TIME, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duration   INT;
  v_step       INT := 30;
  v_dow        INT;
  v_emp        public.employees%ROWTYPE;
  v_entry      public.schedule_entries%ROWTYPE;
  v_has_sched  BOOLEAN;
  v_start      TIME;
  v_end        TIME;
  v_brk_s      TIME;
  v_brk_e      TIME;
  v_cur        TIME;
  v_slot_end   TIME;
  v_min_adv    INT := 0;
  v_max_adv    INT := 365;
  v_bs         JSONB;
  v_today      DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_now_t      TIME := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
BEGIN
  -- Serviço
  SELECT COALESCE(duration_minutes, 30) INTO v_duration
    FROM public.services WHERE id = p_service;
  IF v_duration IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, 'service_not_found'::TEXT; RETURN;
  END IF;

  -- Configurações de agendamento (JSONB em companies.booking_settings)
  SELECT booking_settings INTO v_bs FROM public.companies WHERE id = p_company;
  v_bs := COALESCE(v_bs, '{}'::jsonb);
  v_step    := COALESCE((v_bs->>'slot_duration_minutes')::INT, 30);
  v_min_adv := COALESCE((v_bs->>'min_advance_minutes')::INT, 0);
  v_max_adv := COALESCE((v_bs->>'advance_booking_days')::INT,
                        (v_bs->>'max_advance_days')::INT, 365);

  -- Limite de antecedência
  IF p_date < v_today THEN
    RETURN QUERY SELECT NULL::TIME, 'past_date'::TEXT; RETURN;
  END IF;
  IF p_date > v_today + v_max_adv THEN
    RETURN QUERY SELECT NULL::TIME, 'beyond_max_advance'::TEXT; RETURN;
  END IF;

  -- Funcionário
  SELECT * INTO v_emp FROM public.employees
    WHERE id = p_employee AND company_id = p_company;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TIME, 'employee_not_found'::TEXT; RETURN;
  END IF;

  IF v_emp.is_active = FALSE
     OR (v_emp.termination_effective_date IS NOT NULL
         AND p_date >= v_emp.termination_effective_date) THEN
    RETURN QUERY SELECT NULL::TIME, 'terminated'::TEXT; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employee_absences a
     WHERE a.employee_id = p_employee
       AND p_date BETWEEN a.start_date AND a.end_date
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'absence'::TEXT; RETURN;
  END IF;

  v_dow := EXTRACT(DOW FROM p_date)::INT;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_hours bh
     WHERE bh.company_id = p_company
       AND bh.day_of_week = v_dow
       AND COALESCE(bh.is_open, TRUE) = TRUE
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'company_closed'::TEXT; RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.schedules s
     WHERE s.tenant_id = p_company
       AND s.status IN ('approved','partially_approved')
       AND p_date BETWEEN s.period_start AND s.period_end
  ) INTO v_has_sched;

  IF NOT v_has_sched THEN
    RETURN QUERY SELECT NULL::TIME, 'no_schedule_published'::TEXT; RETURN;
  END IF;

  SELECT se.* INTO v_entry
    FROM public.schedule_entries se
    JOIN public.schedules s ON s.id = se.schedule_id
   WHERE se.employee_id = p_employee
     AND se.entry_date  = p_date
     AND s.tenant_id    = p_company
     AND s.status IN ('approved','partially_approved')
   ORDER BY se.updated_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TIME, 'no_entry'::TEXT; RETURN;
  END IF;

  IF v_entry.entry_type IN ('F','A','FE','D','DO')
     OR v_entry.start_time IS NULL
     OR v_entry.end_time   IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, ('off_'||v_entry.entry_type)::TEXT; RETURN;
  END IF;

  v_start := v_entry.start_time;
  v_end   := v_entry.end_time;
  v_brk_s := v_entry.break_start;
  v_brk_e := v_entry.break_end;

  v_cur := v_start;
  WHILE v_cur + (v_duration||' min')::INTERVAL <= v_end::INTERVAL LOOP
    v_slot_end := (v_cur::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

    IF p_date = v_today
       AND (v_cur - v_now_t) < (v_min_adv||' min')::INTERVAL THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF v_brk_s IS NOT NULL AND v_brk_e IS NOT NULL
       AND v_cur < v_brk_e AND v_slot_end > v_brk_s THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.employee_breaks b
       WHERE b.company_id = p_company AND b.employee_id = p_employee
         AND b.weekdays @> ARRAY[v_dow]
         AND v_cur < COALESCE(b.end_time, b.window_end)
         AND v_slot_end > COALESCE(b.start_time, b.window_start)
    ) THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.blocked_slots bs
       WHERE bs.employee_id = p_employee
         AND tstzrange(bs.start_time, bs.end_time, '[)')
             && tstzrange((p_date + v_cur)::TIMESTAMPTZ,
                          (p_date + v_slot_end)::TIMESTAMPTZ, '[)')
    ) THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.bookings bk
       WHERE bk.company_id  = p_company
         AND bk.employee_id = p_employee
         AND bk.booking_date = p_date
         AND LOWER(COALESCE(bk.booking_status::text,'')) NOT IN ('cancelled','canceled','rejected','no_show')
         AND (v_cur, v_slot_end) OVERLAPS (bk.start_time::TIME,
                                           COALESCE(bk.end_time::TIME,
                                                    (bk.start_time::TIME
                                                     + (COALESCE(bk.duration_minutes,30)||' min')::INTERVAL)))
    ) THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    slot   := v_cur;
    reason := NULL;
    RETURN NEXT;
    v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
  END LOOP;

  RETURN;
END $$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid,uuid,uuid,date) TO authenticated, anon, service_role;

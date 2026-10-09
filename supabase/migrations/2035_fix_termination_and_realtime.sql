-- ============================================================================
-- 2035 — Correções:
--  (1) Desligamento programado: NÃO bloquear disponibilidade antes da data
--      efetiva. Só bloquear quando p_date >= termination_effective_date,
--      ou quando is_active=false E não houver data programada (desligamento
--      imediato/manual).
--  (2) Habilitar REALTIME para o sidebar (badges em tempo real) em:
--      bookings, requests, company_notifications, schedules, employee_absences.
-- ============================================================================

-- (1) get_available_slots — ajuste do bloco "terminated"
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
  SELECT COALESCE(duration_minutes, 30) INTO v_duration
    FROM public.services WHERE id = p_service;
  IF v_duration IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, 'service_not_found'::TEXT; RETURN;
  END IF;

  SELECT booking_settings INTO v_bs FROM public.companies WHERE id = p_company;
  v_bs := COALESCE(v_bs, '{}'::jsonb);

  SELECT
    COALESCE(css.slot_duration_minutes, (v_bs->>'slot_duration_minutes')::INT, 30),
    COALESCE(css.min_advance_hours * 60, (v_bs->>'min_advance_minutes')::INT, 0),
    COALESCE(css.max_advance_days,
             (v_bs->>'advance_booking_days')::INT,
             (v_bs->>'max_advance_days')::INT, 365)
  INTO v_step, v_min_adv, v_max_adv
  FROM (SELECT 1) x
  LEFT JOIN public.company_schedule_settings css ON css.company_id = p_company;

  IF p_date < v_today THEN
    RETURN QUERY SELECT NULL::TIME, 'past_date'::TEXT; RETURN;
  END IF;
  IF p_date > v_today + v_max_adv THEN
    RETURN QUERY SELECT NULL::TIME, 'beyond_max_advance'::TEXT; RETURN;
  END IF;

  SELECT * INTO v_emp FROM public.employees
    WHERE id = p_employee AND company_id = p_company;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TIME, 'employee_not_found'::TEXT; RETURN;
  END IF;

  -- CORREÇÃO: respeitar desligamento PROGRAMADO.
  -- Bloqueia somente quando:
  --   (a) há data efetiva e a consulta é >= essa data; OU
  --   (b) is_active = false e NÃO há data programada (desligamento imediato).
  IF (v_emp.termination_effective_date IS NOT NULL
        AND p_date >= v_emp.termination_effective_date)
     OR (v_emp.is_active = FALSE
        AND v_emp.termination_effective_date IS NULL) THEN
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
         AND (v_cur, v_slot_end) OVERLAPS (bs.start_time::TIME, bs.end_time::TIME)
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

-- is_slot_available: mesma correção no bloco de desligamento
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_slot_available' AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.is_slot_available(
        p_company UUID, p_employee UUID, p_service UUID,
        p_date DATE, p_start TIME, p_ignore_booking UUID DEFAULT NULL
      ) RETURNS BOOLEAN
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
      DECLARE
        v_emp public.employees%ROWTYPE;
        v_duration INT;
        v_end TIME;
      BEGIN
        SELECT * INTO v_emp FROM public.employees WHERE id = p_employee AND company_id = p_company;
        IF NOT FOUND THEN RETURN FALSE; END IF;

        -- Mesma regra do get_available_slots
        IF (v_emp.termination_effective_date IS NOT NULL
              AND p_date >= v_emp.termination_effective_date)
           OR (v_emp.is_active = FALSE
              AND v_emp.termination_effective_date IS NULL) THEN
          RETURN FALSE;
        END IF;

        SELECT COALESCE(duration_minutes, 30) INTO v_duration FROM public.services WHERE id = p_service;
        v_end := (p_start::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

        -- Reaproveita get_available_slots: o slot precisa estar listado
        RETURN EXISTS (
          SELECT 1 FROM public.get_available_slots(p_company, p_employee, p_service, p_date) gs
          WHERE gs.slot = p_start
        );
      END $f$;
    $sql$;
  END IF;
END $$;

-- (2) REALTIME — adicionar tabelas à publicação supabase_realtime (idempotente)
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings',
    'requests',
    'company_notifications',
    'schedules',
    'employee_absences'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

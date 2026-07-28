-- ============================================================================
-- 2069 — Hotfix definitivo para timeout em get_available_slots no painel admin
--
-- Contexto:
--   Após adicionar o override administrativo de antecedência mínima, o painel
--   ainda podia receber 57014 (statement timeout) em dias com janela estendida
--   e/ou muitos bloqueios/agendamentos históricos.
--
-- Correção:
--   1) Mantém somente a assinatura vigente de 5 parâmetros.
--   2) Protege slot_duration_minutes inválido/zerado para evitar loop infinito.
--   3) Filtra blocked_slots por empresa, colaborador/geral e pelo dia consultado.
--   4) Suporta schemas históricos de blocked_slots:
--      - start_datetime/end_datetime; ou
--      - start_time/end_time.
--   5) Mantém p_ignore_min_advance para o painel admin sem afetar o fluxo público.
-- ============================================================================

BEGIN;

-- Evita ambiguidade do PostgREST.
DROP FUNCTION IF EXISTS public.get_available_slots(uuid, uuid, uuid, date);

-- Índices de apoio idempotentes.
CREATE INDEX IF NOT EXISTS idx_bookings_availability_lookup
  ON public.bookings (company_id, employee_id, booking_date);

CREATE INDEX IF NOT EXISTS idx_employee_breaks_company_emp
  ON public.employee_breaks (company_id, employee_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blocked_slots'
      AND column_name = 'start_datetime'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blocked_slots_company_emp_start_dt ON public.blocked_slots (company_id, employee_id, start_datetime)';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blocked_slots'
      AND column_name = 'start_time'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blocked_slots_company_emp ON public.blocked_slots (company_id, employee_id)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_date     DATE,
  p_ignore_min_advance BOOLEAN DEFAULT FALSE
) RETURNS TABLE(slot TIME, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  v_bk_s       TIME[] := ARRAY[]::TIME[];
  v_bk_e       TIME[] := ARRAY[]::TIME[];
  v_bl_s       TIME[] := ARRAY[]::TIME[];
  v_bl_e       TIME[] := ARRAY[]::TIME[];
  v_eb_s       TIME[] := ARRAY[]::TIME[];
  v_eb_e       TIME[] := ARRAY[]::TIME[];
  v_i          INT;
  v_conflict   BOOLEAN;
  v_guard      INT := 0;

  v_has_block_datetime BOOLEAN := FALSE;
  v_has_block_time     BOOLEAN := FALSE;
  v_block_start_type   TEXT;
  v_day_start_tstz     TIMESTAMPTZ := ((p_date::TEXT || ' 00:00:00-03')::TIMESTAMPTZ);
  v_day_end_tstz       TIMESTAMPTZ := (((p_date + 1)::TEXT || ' 00:00:00-03')::TIMESTAMPTZ);
  v_day_start_ts       TIMESTAMP := p_date::TIMESTAMP;
  v_day_end_ts         TIMESTAMP := (p_date + 1)::TIMESTAMP;
BEGIN
  SELECT COALESCE(NULLIF(duration_minutes, 0), 30) INTO v_duration
    FROM public.services
   WHERE id = p_service
     AND company_id = p_company;

  IF v_duration IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, 'service_not_found'::TEXT; RETURN;
  END IF;
  IF v_duration < 1 THEN v_duration := 30; END IF;
  IF v_duration > 1440 THEN v_duration := 1440; END IF;

  SELECT booking_settings INTO v_bs FROM public.companies WHERE id = p_company;
  v_bs := COALESCE(v_bs, '{}'::jsonb);

  SELECT
    COALESCE(NULLIF(css.slot_duration_minutes, 0), NULLIF((v_bs->>'slot_duration_minutes')::INT, 0), 30),
    COALESCE(css.min_advance_hours * 60, (v_bs->>'min_advance_minutes')::INT, 0),
    COALESCE(css.max_advance_days,
             (v_bs->>'advance_booking_days')::INT,
             (v_bs->>'max_advance_days')::INT, 365)
  INTO v_step, v_min_adv, v_max_adv
  FROM (SELECT 1) x
  LEFT JOIN public.company_schedule_settings css ON css.company_id = p_company;

  -- Proteção contra configuração inválida que causa loop infinito/timeout.
  v_step := COALESCE(NULLIF(v_step, 0), 30);
  IF v_step < 5 THEN v_step := 5; END IF;
  IF v_step > 240 THEN v_step := 240; END IF;
  v_min_adv := GREATEST(COALESCE(v_min_adv, 0), 0);
  v_max_adv := GREATEST(COALESCE(v_max_adv, 365), 0);

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

  IF v_emp.is_active = FALSE
     OR (v_emp.termination_effective_date IS NOT NULL
         AND p_date >= v_emp.termination_effective_date) THEN
    RETURN QUERY SELECT NULL::TIME, 'terminated'::TEXT; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employee_absences a
     WHERE a.company_id = p_company
       AND a.employee_id = p_employee
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

  -- Bookings ativos do dia: uma leitura indexada, sem subquery dentro do loop.
  SELECT
    COALESCE(ARRAY_AGG(bstart), ARRAY[]::TIME[]),
    COALESCE(ARRAY_AGG(bend),   ARRAY[]::TIME[])
  INTO v_bk_s, v_bk_e
  FROM (
    SELECT
      COALESCE(
        bk.booking_time,
        (bk.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME
      ) AS bstart,
      COALESCE(
        (bk.end_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
        COALESCE(
          bk.booking_time,
          (bk.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME
        ) + (COALESCE(NULLIF(bk.duration_minutes, 0), 30)||' min')::INTERVAL
      ) AS bend
    FROM public.bookings bk
    WHERE bk.company_id  = p_company
      AND bk.employee_id = p_employee
      AND bk.booking_date = p_date
      AND LOWER(COALESCE(bk.booking_status::text,''))
          NOT IN ('cancelled','canceled','rejected','no_show')
  ) t;

  -- Bloqueios: suporta start_datetime/end_datetime ou start_time/end_time.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blocked_slots'
      AND column_name = 'start_datetime'
  ) INTO v_has_block_datetime;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blocked_slots'
      AND column_name = 'start_time'
  ) INTO v_has_block_time;

  IF v_has_block_datetime THEN
    SELECT data_type INTO v_block_start_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'blocked_slots'
       AND column_name = 'start_datetime'
     LIMIT 1;

    IF v_block_start_type = 'timestamp with time zone' THEN
      EXECUTE $SQL$
        SELECT
          COALESCE(ARRAY_AGG((bs.start_datetime AT TIME ZONE 'America/Sao_Paulo')::TIME), ARRAY[]::TIME[]),
          COALESCE(ARRAY_AGG((bs.end_datetime   AT TIME ZONE 'America/Sao_Paulo')::TIME), ARRAY[]::TIME[])
        FROM public.blocked_slots bs
        WHERE bs.company_id = $1
          AND (bs.employee_id IS NULL OR bs.employee_id = $2)
          AND bs.start_datetime < $4
          AND bs.end_datetime   > $3
      $SQL$ INTO v_bl_s, v_bl_e USING p_company, p_employee, v_day_start_tstz, v_day_end_tstz;
    ELSE
      EXECUTE $SQL$
        SELECT
          COALESCE(ARRAY_AGG(bs.start_datetime::TIME), ARRAY[]::TIME[]),
          COALESCE(ARRAY_AGG(bs.end_datetime::TIME),   ARRAY[]::TIME[])
        FROM public.blocked_slots bs
        WHERE bs.company_id = $1
          AND (bs.employee_id IS NULL OR bs.employee_id = $2)
          AND bs.start_datetime < $4
          AND bs.end_datetime   > $3
      $SQL$ INTO v_bl_s, v_bl_e USING p_company, p_employee, v_day_start_ts, v_day_end_ts;
    END IF;
  ELSIF v_has_block_time THEN
    EXECUTE $SQL$
      SELECT
        COALESCE(ARRAY_AGG(bs.start_time::TIME), ARRAY[]::TIME[]),
        COALESCE(ARRAY_AGG(bs.end_time::TIME),   ARRAY[]::TIME[])
      FROM public.blocked_slots bs
      WHERE bs.company_id = $1
        AND (bs.employee_id IS NULL OR bs.employee_id = $2)
    $SQL$ INTO v_bl_s, v_bl_e USING p_company, p_employee;
  END IF;

  SELECT
    COALESCE(ARRAY_AGG(bstart), ARRAY[]::TIME[]),
    COALESCE(ARRAY_AGG(bend),   ARRAY[]::TIME[])
  INTO v_eb_s, v_eb_e
  FROM (
    SELECT
      COALESCE(b.start_time, b.window_start) AS bstart,
      COALESCE(b.end_time,   b.window_end)   AS bend
    FROM public.employee_breaks b
    WHERE b.company_id  = p_company
      AND b.employee_id = p_employee
      AND b.weekdays @> ARRAY[v_dow]
  ) t;

  v_cur := v_start;
  WHILE v_cur + (v_duration||' min')::INTERVAL <= v_end::INTERVAL LOOP
    v_guard := v_guard + 1;
    IF v_guard > 288 THEN
      EXIT;
    END IF;

    v_slot_end := (v_cur::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

    -- Nunca libera horários que já começaram no dia atual.
    IF p_date = v_today AND v_cur < v_now_t THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    -- Público respeita antecedência mínima; painel admin pode ignorá-la.
    IF p_date = v_today
       AND NOT COALESCE(p_ignore_min_advance, FALSE)
       AND (v_cur - v_now_t) < (v_min_adv||' min')::INTERVAL THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF v_brk_s IS NOT NULL AND v_brk_e IS NOT NULL
       AND v_cur < v_brk_e AND v_slot_end > v_brk_s THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    v_conflict := FALSE;
    IF array_length(v_eb_s, 1) IS NOT NULL THEN
      FOR v_i IN 1 .. array_length(v_eb_s, 1) LOOP
        IF v_cur < v_eb_e[v_i] AND v_slot_end > v_eb_s[v_i] THEN
          v_conflict := TRUE; EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_conflict THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    v_conflict := FALSE;
    IF array_length(v_bl_s, 1) IS NOT NULL THEN
      FOR v_i IN 1 .. array_length(v_bl_s, 1) LOOP
        IF v_cur < v_bl_e[v_i] AND v_slot_end > v_bl_s[v_i] THEN
          v_conflict := TRUE; EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_conflict THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    v_conflict := FALSE;
    IF array_length(v_bk_s, 1) IS NOT NULL THEN
      FOR v_i IN 1 .. array_length(v_bk_s, 1) LOOP
        IF v_cur < v_bk_e[v_i] AND v_slot_end > v_bk_s[v_i] THEN
          v_conflict := TRUE; EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_conflict THEN
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

GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, uuid, date, boolean)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
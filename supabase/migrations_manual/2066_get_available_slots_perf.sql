-- ============================================================================
-- 2066 — Performance fix em get_available_slots
--
-- Sintoma:
--   RPC get_available_slots retorna 57014 (statement timeout) em dias com
--   janela longa (ex.: 08:00–23:59) e/ou muitos bookings. Frontend recebe
--   erro e trata como "sem slots" → dia some do calendário.
--
-- Causa:
--   O loop de slots (32+ iterações num dia de 16h com passo 30min) executa
--   4 subqueries EXISTS por iteração. Duas delas escalam mal:
--     • bookings: OVERLAPS com COALESCE(booking_time, ... AT TIME ZONE ...)
--       impede uso de índice e é reavaliado por linha por iteração.
--     • blocked_slots: sem filtro por company_id/dia, varre a tabela toda.
--   Além disso, 2057 removeu STABLE, o que corta fastpaths do planner.
--
-- Correção:
--   1) Reintroduz STABLE.
--   2) Pré-materializa em arrays os intervalos (start,end) do dia para
--      bookings, blocked_slots e employee_breaks — uma varredura por
--      tabela, indexada, com o COALESCE/AT TIME ZONE resolvido antes do loop.
--   3) Loop apenas cruza tempos em memória — O(N) por iteração vira
--      O(k) com k = poucas colisões esperadas.
--   4) Cria índices de apoio se ainda não existirem.
-- ============================================================================

BEGIN;

-- Índices de apoio (idempotentes)
CREATE INDEX IF NOT EXISTS idx_bookings_company_emp_date
  ON public.bookings (company_id, employee_id, booking_date);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_company_emp
  ON public.blocked_slots (company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_breaks_company_emp
  ON public.employee_breaks (company_id, employee_id);

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

  -- Intervalos pré-materializados (paralelos: _s[i] casa com _e[i])
  v_bk_s       TIME[] := ARRAY[]::TIME[];
  v_bk_e       TIME[] := ARRAY[]::TIME[];
  v_bl_s       TIME[] := ARRAY[]::TIME[];
  v_bl_e       TIME[] := ARRAY[]::TIME[];
  v_eb_s       TIME[] := ARRAY[]::TIME[];
  v_eb_e       TIME[] := ARRAY[]::TIME[];
  v_i          INT;
  v_conflict   BOOLEAN;
BEGIN
  -- Serviço
  SELECT COALESCE(duration_minutes, 30) INTO v_duration
    FROM public.services WHERE id = p_service;
  IF v_duration IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, 'service_not_found'::TEXT; RETURN;
  END IF;

  -- Config de agendamento
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

  -- =========================================================================
  -- Pré-materializa intervalos do dia (uma varredura por tabela, indexada)
  -- =========================================================================

  -- Bookings ativos do dia
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
        ) + (COALESCE(bk.duration_minutes, 30)||' min')::INTERVAL
      ) AS bend
    FROM public.bookings bk
    WHERE bk.company_id  = p_company
      AND bk.employee_id = p_employee
      AND bk.booking_date = p_date
      AND LOWER(COALESCE(bk.booking_status::text,''))
          NOT IN ('cancelled','canceled','rejected','no_show')
  ) t;

  -- Blocked slots do colaborador. blocked_slots.start_time/end_time podem ser
  -- TIME, TEXT ou TIMESTAMPTZ dependendo do histórico do schema; o cast ::TIME
  -- funciona pros três casos e mantém compatibilidade com is_slot_available.
  SELECT
    COALESCE(ARRAY_AGG(bstart), ARRAY[]::TIME[]),
    COALESCE(ARRAY_AGG(bend),   ARRAY[]::TIME[])
  INTO v_bl_s, v_bl_e
  FROM (
    SELECT
      bs.start_time::TIME AS bstart,
      bs.end_time::TIME   AS bend
    FROM public.blocked_slots bs
    WHERE bs.employee_id = p_employee
  ) t;

  -- Employee breaks aplicáveis ao dia da semana
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

  -- =========================================================================
  -- Loop de slots — sem subqueries dentro
  -- =========================================================================
  v_cur := v_start;
  WHILE v_cur + (v_duration||' min')::INTERVAL <= v_end::INTERVAL LOOP
    v_slot_end := (v_cur::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

    -- Antecedência mínima (só hoje)
    IF p_date = v_today
       AND (v_cur - v_now_t) < (v_min_adv||' min')::INTERVAL THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    -- Intervalo/almoço da própria entry
    IF v_brk_s IS NOT NULL AND v_brk_e IS NOT NULL
       AND v_cur < v_brk_e AND v_slot_end > v_brk_s THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    -- Employee breaks
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

    -- Blocked slots
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

    -- Bookings existentes
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

GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid,uuid,uuid,date)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

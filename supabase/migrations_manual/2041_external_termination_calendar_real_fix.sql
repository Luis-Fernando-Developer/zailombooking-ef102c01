-- ============================================================================
-- 2041 — CORREÇÃO DEFINITIVA EXTERNA: desligamento futuro não bloqueia calendário
--
-- Problema observado:
--   Funcionário com desligamento programado para 16/07/2026 continua sem datas
--   disponíveis em 30/06..15/07 na realocação/agendamento.
--
-- Causa provável nos bancos externos já afetados:
--   1) A lista mensal list_available_dates dependia de get_available_slots e a UI
--      desabilitava todos os dias quando essa lista voltava vazia.
--   2) Alguns bancos ficaram com registros genéricos em employee_absences ou
--      entries D criadas por rotinas antigas de desligamento. Esses resíduos
--      bloqueavam datas anteriores à data efetiva.
--
-- Regra de negócio aplicada aqui:
--   p_date < termination_effective_date  => o colaborador AINDA trabalha; usa T.
--   p_date >= termination_effective_date => bloqueia como terminated/D.
--
-- Deploy manual no SQL Editor do seu Supabase EXTERNO.
-- Não usa Lovable Cloud. Não exige Edge Function.
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_schedule_entries_emp_date_status_fix
  ON public.schedule_entries(employee_id, entry_date, schedule_id, entry_type);

CREATE INDEX IF NOT EXISTS idx_employee_absences_emp_period_fix
  ON public.employee_absences(employee_id, start_date, end_date);

-- ---------------------------------------------------------------------------
-- 1) Trigger defensivo: nunca marca D antes da data efetiva e reverte D residual
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_employee_termination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff DATE;
  v_emp UUID := NEW.id;
BEGIN
  v_cutoff := COALESCE(
    NEW.termination_effective_date,
    CASE WHEN NEW.is_active = FALSE THEN CURRENT_DATE ELSE NULL END
  );

  -- Reverte D indevido antes do cutoff usando template ou business_hours.
  WITH targets AS (
    SELECT se.id, se.schedule_id, se.entry_date, s.period_start, s.template_id, s.tenant_id
      FROM public.schedule_entries se
      JOIN public.schedules s ON s.id = se.schedule_id
     WHERE se.employee_id = v_emp
       AND se.entry_type::TEXT = 'D'
       AND (v_cutoff IS NULL OR se.entry_date < v_cutoff)
  ), resolved AS (
    SELECT
      t.id,
      tpl.pattern_days -> (
        ((t.entry_date - t.period_start)::INT)
        % GREATEST(jsonb_array_length(COALESCE(tpl.pattern_days, '[]'::JSONB)), 1)
      ) AS pattern_day,
      bh.open_time,
      bh.close_time,
      COALESCE(bh.is_open, TRUE) AS is_open
    FROM targets t
    LEFT JOIN public.schedule_templates tpl ON tpl.id = t.template_id
    LEFT JOIN public.business_hours bh
      ON bh.company_id = t.tenant_id
     AND bh.day_of_week = EXTRACT(DOW FROM t.entry_date)::INT
  )
  UPDATE public.schedule_entries se
     SET entry_type = CASE
           WHEN r.pattern_day IS NOT NULL AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
             THEN 'T'::public.schedule_entry_type
           WHEN r.pattern_day IS NOT NULL
             THEN 'F'::public.schedule_entry_type
           WHEN r.is_open IS TRUE
             THEN 'T'::public.schedule_entry_type
           ELSE 'F'::public.schedule_entry_type
         END,
         start_time = CASE
           WHEN r.pattern_day IS NOT NULL AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
             THEN NULLIF(r.pattern_day->>'start', '')::TIME
           WHEN r.pattern_day IS NULL AND r.is_open IS TRUE
             THEN r.open_time
           ELSE NULL
         END,
         end_time = CASE
           WHEN r.pattern_day IS NOT NULL AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
             THEN NULLIF(r.pattern_day->>'end', '')::TIME
           WHEN r.pattern_day IS NULL AND r.is_open IS TRUE
             THEN r.close_time
           ELSE NULL
         END,
         break_start = CASE
           WHEN r.pattern_day IS NOT NULL AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
             THEN NULLIF(r.pattern_day->>'break_start', '')::TIME
           ELSE NULL
         END,
         break_end = CASE
           WHEN r.pattern_day IS NOT NULL AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
             THEN NULLIF(r.pattern_day->>'break_end', '')::TIME
           ELSE NULL
         END,
         updated_at = NOW()
    FROM resolved r
   WHERE se.id = r.id;

  -- Aplica D somente a partir da data efetiva/imediata.
  IF v_cutoff IS NOT NULL THEN
    UPDATE public.schedule_entries
       SET entry_type = 'D'::public.schedule_entry_type,
           start_time = NULL,
           end_time = NULL,
           break_start = NULL,
           break_end = NULL,
           updated_at = NOW()
     WHERE employee_id = v_emp
       AND entry_date >= v_cutoff
       AND entry_type::TEXT <> 'D';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_terminated ON public.employees;
CREATE TRIGGER trg_employee_terminated
  AFTER UPDATE OF is_active, termination_effective_date ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_employee_termination();

-- Força reparo dos colaboradores que já possuem desligamento programado.
UPDATE public.employees
   SET termination_effective_date = termination_effective_date
 WHERE termination_effective_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Fonte única de disponibilidade, com regra explícita de desligamento futuro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_date     DATE
) RETURNS TABLE(slot TIME, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration INT;
  v_step INT := 30;
  v_dow INT;
  v_emp public.employees%ROWTYPE;
  v_entry public.schedule_entries%ROWTYPE;
  v_sched_period_start DATE;
  v_sched_template_id UUID;
  v_pattern_day JSONB;
  v_start TIME;
  v_end TIME;
  v_brk_s TIME;
  v_brk_e TIME;
  v_cur TIME;
  v_slot_end TIME;
  v_min_adv INT := 0;
  v_max_adv INT := 365;
  v_bs JSONB;
  v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_now_t TIME := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
BEGIN
  SELECT COALESCE(duration_minutes, 30)
    INTO v_duration
    FROM public.services
   WHERE id = p_service
     AND company_id = p_company;

  IF v_duration IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, 'service_not_found'::TEXT;
    RETURN;
  END IF;

  SELECT booking_settings INTO v_bs FROM public.companies WHERE id = p_company;
  v_bs := COALESCE(v_bs, '{}'::JSONB);

  SELECT
    COALESCE(css.slot_duration_minutes, NULLIF(v_bs->>'slot_duration_minutes', '')::INT, 30),
    COALESCE(css.min_advance_hours * 60, NULLIF(v_bs->>'min_advance_minutes', '')::INT, 0),
    COALESCE(css.max_advance_days,
             NULLIF(v_bs->>'advance_booking_days', '')::INT,
             NULLIF(v_bs->>'max_advance_days', '')::INT,
             365)
    INTO v_step, v_min_adv, v_max_adv
    FROM (SELECT 1) x
    LEFT JOIN public.company_schedule_settings css ON css.company_id = p_company;

  v_step := GREATEST(COALESCE(v_step, 30), 1);

  IF p_date < v_today THEN
    RETURN QUERY SELECT NULL::TIME, 'past_date'::TEXT;
    RETURN;
  END IF;

  IF p_date > v_today + COALESCE(v_max_adv, 365) THEN
    RETURN QUERY SELECT NULL::TIME, 'beyond_max_advance'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_emp
    FROM public.employees
   WHERE id = p_employee
     AND company_id = p_company;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TIME, 'employee_not_found'::TEXT;
    RETURN;
  END IF;

  -- Regra central: is_active=false NÃO bloqueia datas anteriores ao desligamento
  -- quando existe termination_effective_date futura.
  IF (v_emp.termination_effective_date IS NOT NULL AND p_date >= v_emp.termination_effective_date)
     OR (v_emp.termination_effective_date IS NULL AND v_emp.is_active = FALSE) THEN
    RETURN QUERY SELECT NULL::TIME, 'terminated'::TEXT;
    RETURN;
  END IF;

  v_dow := EXTRACT(DOW FROM p_date)::INT;
  IF NOT EXISTS (
    SELECT 1
      FROM public.business_hours bh
     WHERE bh.company_id = p_company
       AND bh.day_of_week = v_dow
       AND COALESCE(bh.is_open, TRUE) = TRUE
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'company_closed'::TEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.schedules s
     WHERE s.tenant_id = p_company
       AND s.status IN ('approved', 'partially_approved')
       AND p_date BETWEEN s.period_start AND s.period_end
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'no_schedule_published'::TEXT;
    RETURN;
  END IF;

  -- Primeiro escolhe a entry aprovada do dia. Antes do desligamento, T ganha
  -- prioridade sobre resíduos D criados por rotinas antigas.
  SELECT se.*
    INTO v_entry
    FROM public.schedule_entries se
    JOIN public.schedules s ON s.id = se.schedule_id
   WHERE se.employee_id = p_employee
     AND se.entry_date = p_date
     AND s.tenant_id = p_company
     AND s.status IN ('approved', 'partially_approved')
   ORDER BY
     CASE
       WHEN v_emp.termination_effective_date IS NOT NULL
        AND p_date < v_emp.termination_effective_date
        AND se.entry_type::TEXT = 'T'
        AND se.start_time IS NOT NULL
        AND se.end_time IS NOT NULL THEN 0
       WHEN v_emp.termination_effective_date IS NOT NULL
        AND p_date < v_emp.termination_effective_date
        AND se.entry_type::TEXT <> 'D' THEN 1
       ELSE 2
     END,
     se.updated_at DESC,
     se.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TIME, 'no_entry'::TEXT;
    RETURN;
  END IF;

  SELECT s.period_start, s.template_id
    INTO v_sched_period_start, v_sched_template_id
    FROM public.schedules s
   WHERE s.id = v_entry.schedule_id;

  -- D antes do desligamento é resíduo; reconstrói em runtime.
  IF v_entry.entry_type::TEXT = 'D'
     AND v_emp.termination_effective_date IS NOT NULL
     AND p_date < v_emp.termination_effective_date THEN
    SELECT tpl.pattern_days -> (
             ((p_date - v_sched_period_start)::INT)
             % GREATEST(jsonb_array_length(COALESCE(tpl.pattern_days, '[]'::JSONB)), 1)
           )
      INTO v_pattern_day
      FROM public.schedule_templates tpl
     WHERE tpl.id = v_sched_template_id;

    IF v_pattern_day IS NOT NULL AND COALESCE((v_pattern_day->>'work')::BOOLEAN, FALSE) THEN
      v_entry.entry_type := 'T'::public.schedule_entry_type;
      v_entry.start_time := NULLIF(v_pattern_day->>'start', '')::TIME;
      v_entry.end_time := NULLIF(v_pattern_day->>'end', '')::TIME;
      v_entry.break_start := NULLIF(v_pattern_day->>'break_start', '')::TIME;
      v_entry.break_end := NULLIF(v_pattern_day->>'break_end', '')::TIME;
    ELSE
      SELECT 'T'::public.schedule_entry_type, bh.open_time, bh.close_time, NULL::TIME, NULL::TIME
        INTO v_entry.entry_type, v_entry.start_time, v_entry.end_time, v_entry.break_start, v_entry.break_end
        FROM public.business_hours bh
       WHERE bh.company_id = p_company
         AND bh.day_of_week = v_dow
         AND COALESCE(bh.is_open, TRUE) = TRUE
       LIMIT 1;
    END IF;
  END IF;

  IF v_entry.entry_type::TEXT IN ('F', 'A', 'FE', 'FA', 'D', 'DO')
     OR v_entry.start_time IS NULL
     OR v_entry.end_time IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, ('off_' || v_entry.entry_type)::TEXT;
    RETURN;
  END IF;

  -- Absências independentes continuam bloqueando, mas ignora resíduos genéricos
  -- que atravessam a data de desligamento ou possuem texto de desligamento.
  IF EXISTS (
    SELECT 1
      FROM public.employee_absences a
     WHERE a.employee_id = p_employee
       AND p_date BETWEEN a.start_date AND a.end_date
       AND NOT (
         v_emp.termination_effective_date IS NOT NULL
         AND p_date < v_emp.termination_effective_date
         AND (
           LOWER(COALESCE(a.reason, '')) LIKE '%deslig%'
           OR LOWER(COALESCE(a.reason, '')) LIKE '%demiss%'
           OR LOWER(COALESCE(a.reason, '')) LIKE '%termination%'
           OR LOWER(COALESCE(a.absence_type::TEXT, '')) IN ('termination', 'terminated', 'dismissal', 'desligamento')
           OR (
             a.end_date >= v_emp.termination_effective_date
             AND LOWER(COALESCE(a.absence_type::TEXT, '')) IN ('absence', 'leave', 'other', '')
           )
         )
       )
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'absence'::TEXT;
    RETURN;
  END IF;

  v_start := v_entry.start_time;
  v_end := v_entry.end_time;
  v_brk_s := v_entry.break_start;
  v_brk_e := v_entry.break_end;
  v_cur := v_start;

  WHILE (v_cur::INTERVAL + (v_duration || ' min')::INTERVAL) <= v_end::INTERVAL LOOP
    v_slot_end := (v_cur::INTERVAL + (v_duration || ' min')::INTERVAL)::TIME;

    IF p_date = v_today
       AND (v_cur - v_now_t) < (COALESCE(v_min_adv, 0) || ' min')::INTERVAL THEN
      v_cur := (v_cur::INTERVAL + (v_step || ' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    IF v_brk_s IS NOT NULL AND v_brk_e IS NOT NULL
       AND v_cur < v_brk_e AND v_slot_end > v_brk_s THEN
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

    IF EXISTS (
      SELECT 1
        FROM public.bookings bk
       WHERE bk.company_id = p_company
         AND bk.employee_id = p_employee
         AND bk.booking_date = p_date
         AND LOWER(COALESCE(bk.booking_status::TEXT, '')) NOT IN ('cancelled','canceled','rejected','no_show')
         AND (v_cur, v_slot_end) OVERLAPS (
           bk.start_time::TIME,
           COALESCE(
             bk.end_time::TIME,
             bk.start_time::TIME + (COALESCE(bk.duration_minutes, 30) || ' min')::INTERVAL
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

-- ---------------------------------------------------------------------------
-- 3) Gate de escrita usa a mesma SSOT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_slot_available(
  p_company UUID,
  p_employee UUID,
  p_service UUID,
  p_date DATE,
  p_start TIME,
  p_ignore_booking UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM public.get_available_slots(p_company, p_employee, p_service, p_date) gs
     WHERE gs.slot = p_start
  )
  AND NOT EXISTS (
    SELECT 1
      FROM public.bookings bk
     WHERE bk.company_id = p_company
       AND bk.employee_id = p_employee
       AND bk.booking_date = p_date
       AND (p_ignore_booking IS NULL OR bk.id <> p_ignore_booking)
       AND LOWER(COALESCE(bk.booking_status::TEXT, '')) NOT IN ('cancelled','canceled','rejected','no_show')
       AND (p_start, p_start + (COALESCE(bk.duration_minutes, 30) || ' min')::INTERVAL)
           OVERLAPS (
             bk.start_time::TIME,
             COALESCE(
               bk.end_time::TIME,
               bk.start_time::TIME + (COALESCE(bk.duration_minutes, 30) || ' min')::INTERVAL
             )
           )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_slot_available(UUID, UUID, UUID, DATE, TIME, UUID)
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 4) Lista mensal: mantém compatibilidade, mas baseada na SSOT acima
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_available_dates(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_from     DATE,
  p_to       DATE
) RETURNS TABLE(available_date DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_max_adv INT := 365;
  v_bs JSONB;
  v_from DATE := GREATEST(p_from, v_today);
  v_to DATE := p_to;
  d DATE;
BEGIN
  SELECT booking_settings INTO v_bs FROM public.companies WHERE id = p_company;
  v_bs := COALESCE(v_bs, '{}'::JSONB);

  SELECT COALESCE(
           css.max_advance_days,
           NULLIF(v_bs->>'advance_booking_days', '')::INT,
           NULLIF(v_bs->>'max_advance_days', '')::INT,
           365
         )
    INTO v_max_adv
    FROM (SELECT 1) x
    LEFT JOIN public.company_schedule_settings css ON css.company_id = p_company;

  v_to := LEAST(v_to, v_today + COALESCE(v_max_adv, 365));
  IF v_from > v_to THEN RETURN; END IF;

  FOR d IN SELECT generate_series(v_from, v_to, INTERVAL '1 day')::DATE LOOP
    IF EXISTS (
      SELECT 1
        FROM public.get_available_slots(p_company, p_employee, p_service, d) s
       WHERE s.slot IS NOT NULL
       LIMIT 1
    ) THEN
      available_date := d;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_available_dates(UUID, UUID, UUID, DATE, DATE)
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 5) Diagnóstico detalhado. DROP antes para evitar erro 42P13 de OUT params.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.debug_employee_availability_reasons(UUID, UUID, UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.debug_employee_availability_reasons(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_from     DATE,
  p_to       DATE
) RETURNS TABLE(
  check_date DATE,
  is_active BOOLEAN,
  termination_effective_date DATE,
  chosen_entry_type TEXT,
  chosen_start_time TIME,
  chosen_end_time TIME,
  has_absence BOOLEAN,
  absence_types TEXT,
  absence_reasons TEXT,
  first_reason TEXT,
  slots_count INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d DATE;
BEGIN
  FOR d IN SELECT generate_series(p_from, p_to, INTERVAL '1 day')::DATE LOOP
    RETURN QUERY
    WITH emp AS (
      SELECT e.is_active, e.termination_effective_date
        FROM public.employees e
       WHERE e.id = p_employee AND e.company_id = p_company
    ), picked_entry AS (
      SELECT se.entry_type::TEXT AS entry_type, se.start_time, se.end_time
        FROM public.schedule_entries se
        JOIN public.schedules s ON s.id = se.schedule_id
       WHERE se.employee_id = p_employee
         AND se.entry_date = d
         AND s.tenant_id = p_company
         AND s.status IN ('approved', 'partially_approved')
       ORDER BY
         CASE WHEN se.entry_type::TEXT = 'T' AND se.start_time IS NOT NULL AND se.end_time IS NOT NULL THEN 0 ELSE 1 END,
         se.updated_at DESC,
         se.created_at DESC
       LIMIT 1
    ), absence_info AS (
      SELECT
        COUNT(*) > 0 AS has_absence,
        STRING_AGG(DISTINCT COALESCE(a.absence_type::TEXT, 'NULL'), ', ' ORDER BY COALESCE(a.absence_type::TEXT, 'NULL')) AS absence_types,
        STRING_AGG(DISTINCT COALESCE(a.reason, 'NULL'), ' | ' ORDER BY COALESCE(a.reason, 'NULL')) AS absence_reasons
        FROM public.employee_absences a
       WHERE a.employee_id = p_employee
         AND d BETWEEN a.start_date AND a.end_date
    ), slots AS (
      SELECT * FROM public.get_available_slots(p_company, p_employee, p_service, d)
    )
    SELECT
      d,
      emp.is_active,
      emp.termination_effective_date,
      (SELECT entry_type FROM picked_entry),
      (SELECT start_time FROM picked_entry),
      (SELECT end_time FROM picked_entry),
      COALESCE((SELECT ai.has_absence FROM absence_info ai), FALSE),
      (SELECT ai.absence_types FROM absence_info ai),
      (SELECT ai.absence_reasons FROM absence_info ai),
      (SELECT s.reason FROM slots s WHERE s.reason IS NOT NULL LIMIT 1),
      (SELECT COUNT(*)::INT FROM slots s WHERE s.slot IS NOT NULL)
    FROM emp;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_employee_availability_reasons(UUID, UUID, UUID, DATE, DATE)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- TESTE MANUAL — troque os IDs
-- ============================================================================
-- SELECT * FROM public.debug_employee_availability_reasons(
--   '<COMPANY_ID>'::UUID,
--   '<EMPLOYEE_ID>'::UUID,
--   '<SERVICE_ID>'::UUID,
--   '2026-07-01'::DATE,
--   '2026-07-20'::DATE
-- );
--
-- Esperado para desligamento em 16/07/2026:
--   01/07..15/07 => chosen_entry_type='T' e slots_count > 0 quando há escala T.
--   16/07+       => first_reason='terminated' e slots_count=0.
-- ============================================================================
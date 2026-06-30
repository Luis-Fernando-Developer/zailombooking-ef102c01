-- ============================================================================
-- 2042 — CORREÇÃO FINAL: calendário da realocação usa somente datas realmente disponíveis
--
-- Regra aplicada:
--   1) schedule_entries publicado é a fonte de verdade do dia.
--      - T  => pode gerar horários.
--      - A/FE/F/DO/D => não gera horários.
--   2) termination_effective_date bloqueia a própria data e todas posteriores.
--   3) employee_absences não pode sobrescrever uma entry T já publicada.
--      Motivo: resíduos criados por desligamento/rotinas antigas estavam fazendo
--      dias T antes do desligamento aparecerem como "absence".
--   4) Para novas ausências, um trigger passa a refletir employee_absences em
--      schedule_entries A/FE/DO, mantendo a escala como SSOT.
--
-- Deploy manual no SQL Editor do Supabase EXTERNO.
-- Não usa Lovable Cloud. Não exige Edge Function.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Novas ausências devem virar entry de escala, para a escala continuar SSOT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_employee_absence_to_schedule_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_type public.schedule_entry_type;
BEGIN
  v_entry_type := CASE
    WHEN LOWER(COALESCE(NEW.absence_type::TEXT, '')) IN ('vacation', 'ferias', 'férias')
      THEN 'FE'::public.schedule_entry_type
    WHEN LOWER(COALESCE(NEW.absence_type::TEXT, '')) IN ('dayoff', 'day_off', 'do', 'folga')
      THEN 'DO'::public.schedule_entry_type
    ELSE 'A'::public.schedule_entry_type
  END;

  UPDATE public.schedule_entries se
     SET entry_type = v_entry_type,
         start_time = NULL,
         end_time = NULL,
         break_start = NULL,
         break_end = NULL,
         updated_at = NOW()
    FROM public.schedules s
    JOIN public.employees e ON e.id = NEW.employee_id
   WHERE se.schedule_id = s.id
     AND s.tenant_id = NEW.company_id
     AND s.status IN ('approved', 'partially_approved')
     AND se.employee_id = NEW.employee_id
     AND se.entry_date BETWEEN NEW.start_date AND NEW.end_date
     AND NOT (
       e.termination_effective_date IS NOT NULL
       AND se.entry_date >= e.termination_effective_date
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_absence_to_schedule_entries ON public.employee_absences;
CREATE TRIGGER trg_employee_absence_to_schedule_entries
  AFTER INSERT OR UPDATE OF start_date, end_date, absence_type ON public.employee_absences
  FOR EACH ROW EXECUTE FUNCTION public.apply_employee_absence_to_schedule_entries();

-- ---------------------------------------------------------------------------
-- 2) Disponibilidade: escala publicada é a fonte de verdade.
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

  -- Desligamento programado só bloqueia da data efetiva em diante.
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

  -- Escolhe a entry publicada do dia. Antes do desligamento, T válido ganha de
  -- resíduos D antigos; A/FE/F/DO continuam bloqueando normalmente.
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

  IF v_entry.entry_type::TEXT IN ('F', 'A', 'FE', 'FA', 'D', 'DO')
     OR v_entry.start_time IS NULL
     OR v_entry.end_time IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, ('off_' || v_entry.entry_type)::TEXT;
    RETURN;
  END IF;

  -- IMPORTANTE: não checar employee_absences aqui quando já existe entry
  -- publicada. A entry publicada é a fonte de verdade. Isso remove o falso
  -- "absence" em dias T antes do desligamento, sem liberar dias A/FE/D.

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
-- 3) Gate de escrita usa a mesma fonte de verdade.
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
-- 4) Lista mensal: só retorna datas com slot real. O frontend desabilita o resto.
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
-- 5) Diagnóstico: mostra entry escolhida, ausência bruta e resultado final.
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
  raw_absence_count INT,
  raw_absence_types TEXT,
  raw_absence_reasons TEXT,
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
        COUNT(*)::INT AS raw_absence_count,
        STRING_AGG(DISTINCT COALESCE(a.absence_type::TEXT, 'NULL'), ', ' ORDER BY COALESCE(a.absence_type::TEXT, 'NULL')) AS raw_absence_types,
        STRING_AGG(DISTINCT COALESCE(a.reason, 'NULL'), ' | ' ORDER BY COALESCE(a.reason, 'NULL')) AS raw_absence_reasons
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
      COALESCE((SELECT ai.raw_absence_count FROM absence_info ai), 0),
      (SELECT ai.raw_absence_types FROM absence_info ai),
      (SELECT ai.raw_absence_reasons FROM absence_info ai),
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
-- Esperado no seu caso:
--   01/07        => chosen_entry_type='A' ou first_reason='off_A', slots_count=0.
--   14/07        => chosen_entry_type='T', first_reason NULL, slots_count > 0.
--   16/07 em diante => first_reason='terminated', slots_count=0.
-- ============================================================================
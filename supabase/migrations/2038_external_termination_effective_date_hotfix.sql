-- ============================================================================
-- 2038 — HOTFIX EXTERNO: desligamento PROGRAMADO não bloqueia antes da data efetiva
--
-- Problema observado:
--   Ao programar desligamento para 16/07/2026, o colaborador fica sem nenhuma
--   data disponível já a partir de hoje, mesmo tendo entradas aprovadas como
--   trabalho antes de 16/07. O SQL 2037 reparou parte das schedule_entries,
--   mas não garante que get_available_slots/is_slot_available ignorem
--   is_active=false quando existe termination_effective_date futura.
--
-- Regra correta:
--   1) p_date < termination_effective_date  => colaborador continua disponível
--      conforme escala aprovada, ausências, bloqueios e bookings.
--   2) p_date >= termination_effective_date => retorna terminated / bloqueia write.
--   3) is_active=false SEM termination_effective_date => desligamento imediato.
--   4) Próxima escala cujo period_start >= termination_effective_date não deve
--      escalar esse colaborador.
--
-- Deploy manual no SQL Editor do seu Supabase EXTERNO.
-- Não usa Lovable Cloud. Não exige Edge Function para disponibilidade.
-- ============================================================================

BEGIN;

-- Garante colunas usadas pela regra.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS termination_effective_date DATE,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_company_active_termination
  ON public.employees(company_id, is_active, termination_effective_date);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_emp_date_type
  ON public.schedule_entries(employee_id, entry_date, entry_type);

-- ---------------------------------------------------------------------------
-- 1) Trigger idempotente: mantém D só a partir do cutoff real e repara D antigo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_employee_termination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff DATE;
  v_emp    UUID := NEW.id;
BEGIN
  v_cutoff := COALESCE(
    NEW.termination_effective_date,
    CASE WHEN NEW.is_active = FALSE THEN CURRENT_DATE ELSE NULL END
  );

  -- Reverte entries 'D' indevidas antes da data efetiva.
  -- Usa o template da escala quando existir; senão usa business_hours.
  WITH targets AS (
    SELECT se.id, se.schedule_id, se.entry_date, s.period_start, s.template_id, s.tenant_id
      FROM public.schedule_entries se
      JOIN public.schedules s ON s.id = se.schedule_id
     WHERE se.employee_id = v_emp
       AND se.entry_type = 'D'
       AND (v_cutoff IS NULL OR se.entry_date < v_cutoff)
  ), resolved AS (
    SELECT
      t.id,
      COALESCE(
        tpl.pattern_days -> (
          ((t.entry_date - t.period_start)::INT)
          % GREATEST(jsonb_array_length(COALESCE(tpl.pattern_days, '[]'::jsonb)), 1)
        ),
        NULL
      ) AS pattern_day,
      bh.is_open    AS bh_is_open,
      bh.open_time  AS bh_open_time,
      bh.close_time AS bh_close_time
    FROM targets t
    LEFT JOIN public.schedule_templates tpl ON tpl.id = t.template_id
    LEFT JOIN public.business_hours bh
      ON bh.company_id = t.tenant_id
     AND bh.day_of_week = EXTRACT(DOW FROM t.entry_date)::INT
  )
  UPDATE public.schedule_entries se
     SET entry_type = CASE
                        WHEN r.pattern_day IS NOT NULL
                         AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
                          THEN 'T'::public.schedule_entry_type
                        WHEN r.pattern_day IS NOT NULL
                          THEN 'F'::public.schedule_entry_type
                        WHEN COALESCE(r.bh_is_open, FALSE) = TRUE
                          THEN 'T'::public.schedule_entry_type
                        ELSE 'F'::public.schedule_entry_type
                      END,
         start_time = CASE
                        WHEN r.pattern_day IS NOT NULL
                         AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
                          THEN NULLIF(r.pattern_day->>'start', '')::TIME
                        WHEN r.pattern_day IS NULL AND COALESCE(r.bh_is_open, FALSE) = TRUE
                          THEN r.bh_open_time
                        ELSE NULL
                      END,
         end_time = CASE
                        WHEN r.pattern_day IS NOT NULL
                         AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
                          THEN NULLIF(r.pattern_day->>'end', '')::TIME
                        WHEN r.pattern_day IS NULL AND COALESCE(r.bh_is_open, FALSE) = TRUE
                          THEN r.bh_close_time
                        ELSE NULL
                    END,
         break_start = CASE
                         WHEN r.pattern_day IS NOT NULL
                          AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
                           THEN NULLIF(r.pattern_day->>'break_start', '')::TIME
                         ELSE NULL
                       END,
         break_end = CASE
                       WHEN r.pattern_day IS NOT NULL
                        AND COALESCE((r.pattern_day->>'work')::BOOLEAN, FALSE)
                         THEN NULLIF(r.pattern_day->>'break_end', '')::TIME
                       ELSE NULL
                     END,
         updated_at = NOW()
    FROM resolved r
   WHERE se.id = r.id;

  -- Aplica D apenas da data efetiva em diante.
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
       AND entry_type <> 'D';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_terminated ON public.employees;
CREATE TRIGGER trg_employee_terminated
  AFTER UPDATE OF is_active, termination_effective_date ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_employee_termination();

-- ---------------------------------------------------------------------------
-- 2) RPC de disponibilidade: NÃO bloquear antes da data efetiva
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
  v_step     INT := 30;
  v_dow      INT;
  v_emp      public.employees%ROWTYPE;
  v_entry    public.schedule_entries%ROWTYPE;
  v_start    TIME;
  v_end      TIME;
  v_brk_s    TIME;
  v_brk_e    TIME;
  v_cur      TIME;
  v_slot_end TIME;
  v_min_adv  INT := 0;
  v_max_adv  INT := 365;
  v_bs       JSONB;
  v_today    DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_now_t    TIME := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
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

  SELECT booking_settings
    INTO v_bs
    FROM public.companies
   WHERE id = p_company;
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

  SELECT *
    INTO v_emp
    FROM public.employees
   WHERE id = p_employee
     AND company_id = p_company;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TIME, 'employee_not_found'::TEXT;
    RETURN;
  END IF;

  -- CORREÇÃO PRINCIPAL:
  -- is_active=false NÃO bloqueia datas anteriores à termination_effective_date.
  IF (v_emp.termination_effective_date IS NOT NULL AND p_date >= v_emp.termination_effective_date)
     OR (v_emp.termination_effective_date IS NULL AND v_emp.is_active = FALSE) THEN
    RETURN QUERY SELECT NULL::TIME, 'terminated'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.employee_absences a
     WHERE a.employee_id = p_employee
       AND p_date BETWEEN a.start_date AND a.end_date
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'absence'::TEXT;
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

  SELECT se.*
    INTO v_entry
    FROM public.schedule_entries se
    JOIN public.schedules s ON s.id = se.schedule_id
   WHERE se.employee_id = p_employee
     AND se.entry_date = p_date
     AND s.tenant_id = p_company
     AND s.status IN ('approved', 'partially_approved')
   ORDER BY se.updated_at DESC, se.created_at DESC
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

  v_start := v_entry.start_time;
  v_end   := v_entry.end_time;
  v_brk_s := v_entry.break_start;
  v_brk_e := v_entry.break_end;
  v_cur   := v_start;

  WHILE v_cur + (v_duration || ' min')::INTERVAL <= v_end::INTERVAL LOOP
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
-- 3) Gate de escrita: mesma regra do get_available_slots
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
-- 4) Datas disponíveis usadas pela realocação
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
  v_today   DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_max_adv INT := 365;
  v_bs      JSONB;
  v_from    DATE := GREATEST(p_from, v_today);
  v_to      DATE := p_to;
  d         DATE;
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
-- 5) Colaboradores escaláveis com data de referência opcional
--    Use _as_of = period_start ao montar uma escala futura.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_schedulable_employees(
  _company_id UUID,
  _as_of DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (id UUID, name TEXT, profile_code TEXT, profile_name TEXT, level INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.name, sp.code, sp.name, COALESCE(sp.hierarchy_level, 999)
    FROM public.employees e
    LEFT JOIN public.system_profiles sp ON sp.id = e.system_profile_id
   WHERE e.company_id = _company_id
     AND (
       e.termination_effective_date IS NULL
       OR e.termination_effective_date > COALESCE(_as_of, CURRENT_DATE)
     )
     AND (
       e.is_active = TRUE
       OR e.termination_effective_date IS NOT NULL
     )
     AND COALESCE(sp.can_be_scheduled, TRUE) = TRUE
     AND public.user_can_schedule_employee(auth.uid(), e.id);
$$;

GRANT EXECUTE ON FUNCTION public.list_schedulable_employees(UUID, DATE) TO authenticated;

-- Mantém compatibilidade com chamadas antigas de 1 parâmetro.
CREATE OR REPLACE FUNCTION public.list_schedulable_employees(_company_id UUID)
RETURNS TABLE (id UUID, name TEXT, profile_code TEXT, profile_name TEXT, level INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.list_schedulable_employees(_company_id, CURRENT_DATE);
$$;

GRANT EXECUTE ON FUNCTION public.list_schedulable_employees(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Reparo imediato dos dados existentes
-- ---------------------------------------------------------------------------
UPDATE public.employees
   SET termination_effective_date = termination_effective_date
 WHERE termination_effective_date IS NOT NULL;

UPDATE public.employees
   SET is_active = is_active
 WHERE is_active = TRUE
   AND termination_effective_date IS NULL
   AND EXISTS (
     SELECT 1
       FROM public.schedule_entries se
      WHERE se.employee_id = employees.id
        AND se.entry_type = 'D'
        AND se.entry_date >= CURRENT_DATE
   );

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- TESTES MANUAIS — troque os IDs antes de rodar
-- ============================================================================
-- 1) Antes da data efetiva deve retornar slots:
-- SELECT * FROM public.get_available_slots(
--   '<COMPANY_ID>'::UUID,
--   '<EMPLOYEE_ID>'::UUID,
--   '<SERVICE_ID>'::UUID,
--   '2026-07-10'::DATE
-- );
-- Esperado: linhas com slot preenchido, se a escala aprovada tem entry_type='T'.

-- 2) Na data efetiva ou depois deve retornar terminated:
-- SELECT * FROM public.get_available_slots(
--   '<COMPANY_ID>'::UUID,
--   '<EMPLOYEE_ID>'::UUID,
--   '<SERVICE_ID>'::UUID,
--   '2026-07-16'::DATE
-- );
-- Esperado: 1 linha com slot NULL e reason='terminated'.

-- 3) Diagnóstico das entries ao redor do desligamento:
-- SELECT se.entry_date, se.entry_type, se.start_time, se.end_time
--   FROM public.schedule_entries se
--  WHERE se.employee_id = '<EMPLOYEE_ID>'::UUID
--    AND se.entry_date BETWEEN '2026-07-01'::DATE AND '2026-07-20'::DATE
--  ORDER BY se.entry_date;
-- Esperado: antes de 16/07 não deve estar D se a pessoa trabalha; 16/07+ deve estar D.

-- 4) Próximo ciclo: colaborador com termination_effective_date <= period_start
--    não deve aparecer na lista escalável quando chamada com _as_of = period_start:
-- SELECT * FROM public.list_schedulable_employees('<COMPANY_ID>'::UUID, '2026-07-26'::DATE)
--  WHERE id = '<EMPLOYEE_ID>'::UUID;
-- Esperado: zero linhas.
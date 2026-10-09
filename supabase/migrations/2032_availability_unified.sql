-- ============================================================================
-- 2032 — Refatoração: Fonte única de verdade para Disponibilidade
-- Roda manual no SQL Editor. Idempotente.
-- Depende de: 2026_escalas.sql, 2026_employee_breaks.sql, 2031_client_area_enhancements.sql
-- ============================================================================

-- 1. Novos tipos de entrada na escala
--    D  = Desligado (colaborador demitido — gerado automaticamente)
--    DO = Day-off (folga extraordinária pontual definida pelo gestor)
DO $$ BEGIN
  ALTER TYPE schedule_entry_type ADD VALUE IF NOT EXISTS 'DO';
EXCEPTION WHEN others THEN NULL; END $$;

-- 2. Coluna de desligamento programado em employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS termination_effective_date DATE,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_termination_date
  ON public.employees(termination_effective_date)
  WHERE termination_effective_date IS NOT NULL;

-- 3. Tabela de Ausências independente da escala
CREATE TABLE IF NOT EXISTS public.employee_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  absence_type TEXT NOT NULL DEFAULT 'absence'
    CHECK (absence_type IN ('vacation','sick_leave','absence','leave','dayoff')),
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_absences_emp_period
  ON public.employee_absences(employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_absences_company
  ON public.employee_absences(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_absences TO authenticated;
GRANT SELECT ON public.employee_absences TO anon; -- leitura pública para get_available_slots via SECURITY DEFINER usa service_role; mantenha somente se necessário
GRANT ALL ON public.employee_absences TO service_role;

ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "absences_tenant_all" ON public.employee_absences;
CREATE POLICY "absences_tenant_all" ON public.employee_absences
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

DROP TRIGGER IF EXISTS trg_absences_updated_at ON public.employee_absences;
CREATE TRIGGER trg_absences_updated_at BEFORE UPDATE ON public.employee_absences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Trigger de desligamento (substitui o de 2026_escalas.sql)
CREATE OR REPLACE FUNCTION public.handle_employee_termination()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cutoff DATE;
BEGIN
  v_cutoff := COALESCE(NEW.termination_effective_date,
                       CASE WHEN NEW.is_active = FALSE THEN CURRENT_DATE ELSE NULL END);
  IF v_cutoff IS NOT NULL THEN
    UPDATE public.schedule_entries
       SET entry_type = 'D', start_time = NULL, end_time = NULL,
           break_start = NULL, break_end = NULL, updated_at = NOW()
     WHERE employee_id = NEW.id
       AND entry_date >= v_cutoff
       AND entry_type <> 'D';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employee_terminated ON public.employees;
CREATE TRIGGER trg_employee_terminated
  AFTER UPDATE OF is_active, termination_effective_date ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_employee_termination();

-- ============================================================================
-- 5. FONTE ÚNICA DE VERDADE — public.get_available_slots
--    Toda consulta de disponibilidade (cliente, admin, reschedule, realocação)
--    DEVE chamar esta função. Sem fallback legado.
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
  v_step       INT;
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
  v_today      DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_now_t      TIME := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
BEGIN
  -- Serviço
  SELECT COALESCE(duration_minutes, 30) INTO v_duration
    FROM public.services WHERE id = p_service;
  IF v_duration IS NULL THEN
    RETURN QUERY SELECT NULL::TIME, 'service_not_found'::TEXT; RETURN;
  END IF;

  -- Slot step
  SELECT COALESCE(slot_duration_minutes, 30) INTO v_step
    FROM public.company_schedule_settings WHERE company_id = p_company;
  v_step := COALESCE(v_step, 30);

  -- Antecedências
  SELECT COALESCE(min_advance_minutes, 0), COALESCE(max_advance_days, 365)
    INTO v_min_adv, v_max_adv
    FROM public.company_schedule_settings WHERE company_id = p_company;
  v_min_adv := COALESCE(v_min_adv, 0);
  v_max_adv := COALESCE(v_max_adv, 365);

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

  -- Desligamento
  IF v_emp.is_active = FALSE
     OR (v_emp.termination_effective_date IS NOT NULL
         AND p_date >= v_emp.termination_effective_date) THEN
    RETURN QUERY SELECT NULL::TIME, 'terminated'::TEXT; RETURN;
  END IF;

  -- Ausência independente (férias / atestado / folga extra)
  IF EXISTS (
    SELECT 1 FROM public.employee_absences a
     WHERE a.employee_id = p_employee
       AND p_date BETWEEN a.start_date AND a.end_date
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'absence'::TEXT; RETURN;
  END IF;

  -- Empresa precisa ter dia de funcionamento
  v_dow := EXTRACT(DOW FROM p_date)::INT;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_hours bh
     WHERE bh.company_id = p_company
       AND bh.day_of_week = v_dow
       AND COALESCE(bh.is_closed, FALSE) = FALSE
  ) THEN
    RETURN QUERY SELECT NULL::TIME, 'company_closed'::TEXT; RETURN;
  END IF;

  -- Escala publicada cobrindo o período?
  SELECT EXISTS (
    SELECT 1 FROM public.schedules s
     WHERE s.tenant_id = p_company
       AND s.status IN ('approved','partially_approved')
       AND p_date BETWEEN s.period_start AND s.period_end
  ) INTO v_has_sched;

  IF NOT v_has_sched THEN
    RETURN QUERY SELECT NULL::TIME, 'no_schedule_published'::TEXT; RETURN;
  END IF;

  -- Entry específica do colaborador
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

  -- Geração dos slots
  v_cur := v_start;
  WHILE v_cur + (v_duration||' min')::INTERVAL <= v_end::INTERVAL LOOP
    v_slot_end := (v_cur::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

    -- Antecedência mínima (se hoje)
    IF p_date = v_today
       AND (v_cur - v_now_t) < (v_min_adv||' min')::INTERVAL THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    -- Intervalo da escala
    IF v_brk_s IS NOT NULL AND v_brk_e IS NOT NULL
       AND v_cur < v_brk_e AND v_slot_end > v_brk_s THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    -- employee_breaks (fixos por dia da semana)
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

    -- Bloqueios manuais
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

    -- Conflito com booking existente
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

-- ============================================================================
-- 6. is_slot_available — gate único usado por todo write path
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_slot_available(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_date     DATE,
  p_start    TIME,
  p_ignore_booking UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duration INT;
  v_end TIME;
  v_emp public.employees%ROWTYPE;
  v_entry public.schedule_entries%ROWTYPE;
  v_dow INT := EXTRACT(DOW FROM p_date)::INT;
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
                    AND COALESCE(is_closed,FALSE) = FALSE) THEN RETURN FALSE; END IF;

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
                AND tstzrange(bs.start_time, bs.end_time, '[)')
                    && tstzrange((p_date + p_start)::TIMESTAMPTZ,
                                 (p_date + v_end)::TIMESTAMPTZ, '[)')) THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.bookings bk
              WHERE bk.company_id = p_company AND bk.employee_id = p_employee
                AND bk.booking_date = p_date
                AND (p_ignore_booking IS NULL OR bk.id <> p_ignore_booking)
                AND LOWER(COALESCE(bk.booking_status::text,'')) NOT IN ('cancelled','canceled','rejected','no_show')
                AND (p_start, v_end) OVERLAPS (bk.start_time::TIME,
                       COALESCE(bk.end_time::TIME,
                                (bk.start_time::TIME + (COALESCE(bk.duration_minutes,30)||' min')::INTERVAL)))
  ) THEN RETURN FALSE; END IF;

  RETURN TRUE;
END $$;

GRANT EXECUTE ON FUNCTION public.is_slot_available(uuid,uuid,uuid,date,time,uuid) TO authenticated, anon, service_role;

-- ============================================================================
-- 7. Recria client_reschedule_booking usando o gate único
-- ============================================================================
CREATE OR REPLACE FUNCTION public.client_reschedule_booking(
  p_booking_id uuid,
  p_new_date date,
  p_new_start time,
  p_new_employee uuid DEFAULT NULL,
  p_new_service uuid DEFAULT NULL
) RETURNS public.bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.bookings;
  v_new public.bookings;
  v_duration int;
  v_end time;
  v_emp uuid; v_svc uuid;
BEGIN
  SELECT b.* INTO v_old FROM public.bookings b
    JOIN public.clients c ON c.id = b.client_id
   WHERE b.id = p_booking_id AND c.user_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_old.booking_status IN ('completed','cancelled','no_show','in_progress') THEN
    RAISE EXCEPTION 'booking_locked';
  END IF;

  v_emp := COALESCE(p_new_employee, v_old.employee_id);
  v_svc := COALESCE(p_new_service,  v_old.service_id);

  IF NOT public.is_slot_available(v_old.company_id, v_emp, v_svc,
                                  p_new_date, p_new_start, p_booking_id) THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  SELECT COALESCE(duration_minutes,30) INTO v_duration FROM public.services WHERE id = v_svc;
  v_end := (p_new_start::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

  UPDATE public.bookings SET
    booking_date = p_new_date,
    start_time   = p_new_start,
    end_time     = v_end,
    employee_id  = v_emp,
    service_id   = v_svc,
    updated_at   = NOW()
   WHERE id = p_booking_id
   RETURNING * INTO v_new;

  INSERT INTO public.booking_history(booking_id, changed_by, change_type, old_data, new_data)
  VALUES (p_booking_id, auth.uid(), 'reschedule', to_jsonb(v_old), to_jsonb(v_new));

  RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION public.client_reschedule_booking(uuid,date,time,uuid,uuid) TO authenticated;

-- ============================================================================
-- 8. View de agendamentos impactados por mudanças de escala
--    (gestor consulta para realocar / reagendar / cancelar)
-- ============================================================================
CREATE OR REPLACE VIEW public.bookings_needing_action AS
SELECT bk.*,
       NOT public.is_slot_available(bk.company_id, bk.employee_id, bk.service_id,
                                    bk.booking_date, bk.start_time::TIME, bk.id) AS is_inconsistent
  FROM public.bookings bk
 WHERE bk.booking_date >= CURRENT_DATE
   AND LOWER(COALESCE(bk.booking_status::text,'')) NOT IN ('cancelled','canceled','rejected','no_show','completed');

GRANT SELECT ON public.bookings_needing_action TO authenticated, service_role;

-- ============================================================================
-- 9. Backfill: empresas sem company_schedule_settings recebem defaults
-- ============================================================================
-- (opcional — execute se aplicável ao seu schema)
-- INSERT INTO public.company_schedule_settings (company_id, slot_duration_minutes, min_advance_minutes, max_advance_days)
-- SELECT id, 30, 0, 60 FROM public.companies
-- ON CONFLICT (company_id) DO NOTHING;

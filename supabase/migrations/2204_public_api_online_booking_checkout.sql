-- 2204 — restaurar o checkout online após o histórico 2182 estar marcado como aplicado
-- O remoto registra 2182 como aplicada, mas os objetos físicos do hold não existem.
-- Esta migration restaura a tabela e reaplica as RPCs necessárias para a Public API.
BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_slot_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','converted','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_lookup
  ON public.booking_slot_holds(company_id, employee_id, booking_date, status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot_holds_active_idempotent
  ON public.booking_slot_holds(company_id, employee_id, booking_date, booking_time, client_id)
  WHERE status = 'active';

ALTER TABLE public.booking_slot_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_can_read_own_active_holds" ON public.booking_slot_holds;

CREATE POLICY "clients_can_read_own_active_holds"
  ON public.booking_slot_holds
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_company uuid,
  p_employee uuid,
  p_service uuid,
  p_date date,
  p_ignore_min_advance boolean DEFAULT false
)
RETURNS TABLE(slot time without time zone, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_hold_s     TIME[] := ARRAY[]::TIME[];
  v_hold_e     TIME[] := ARRAY[]::TIME[];
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
    ELSIF v_block_start_type = 'timestamp without time zone' THEN
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
    ELSE
      EXECUTE $SQL$
        SELECT
          COALESCE(ARRAY_AGG(bs.start_datetime::TIMESTAMP::TIME), ARRAY[]::TIME[]),
          COALESCE(ARRAY_AGG(bs.end_datetime::TIMESTAMP::TIME),   ARRAY[]::TIME[])
        FROM public.blocked_slots bs
        WHERE bs.company_id = $1
          AND (bs.employee_id IS NULL OR bs.employee_id = $2)
          AND bs.start_datetime::TIMESTAMP < $4
          AND bs.end_datetime::TIMESTAMP   > $3
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

  SELECT
    COALESCE(ARRAY_AGG((h.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME), ARRAY[]::TIME[]),
    COALESCE(ARRAY_AGG((h.end_time   AT TIME ZONE 'America/Sao_Paulo')::TIME), ARRAY[]::TIME[])
  INTO v_hold_s, v_hold_e
  FROM public.booking_slot_holds h
  WHERE h.company_id = p_company
    AND h.employee_id = p_employee
    AND h.booking_date = p_date
    AND h.status = 'active'
    AND h.expires_at > now();

  v_cur := v_start;
  WHILE v_cur + (v_duration||' min')::INTERVAL <= v_end::INTERVAL LOOP
    v_guard := v_guard + 1;
    IF v_guard > 288 THEN
      EXIT;
    END IF;

    v_slot_end := (v_cur::INTERVAL + (v_duration||' min')::INTERVAL)::TIME;

    IF p_date = v_today AND v_cur < v_now_t THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

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

    v_conflict := FALSE;
    IF array_length(v_hold_s, 1) IS NOT NULL THEN
      FOR v_i IN 1 .. array_length(v_hold_s, 1) LOOP
        IF v_cur < v_hold_e[v_i] AND v_slot_end > v_hold_s[v_i] THEN
          v_conflict := TRUE; EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_conflict THEN
      v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
      CONTINUE;
    END IF;

    slot := v_cur;
    reason := NULL;
    RETURN NEXT;
    v_cur := (v_cur::INTERVAL + (v_step||' min')::INTERVAL)::TIME;
  END LOOP;

  RETURN;
END $function$;

CREATE OR REPLACE FUNCTION public.create_online_booking_hold(
  p_company_id UUID,
  p_employee_id UUID,
  p_service_id UUID,
  p_client_id UUID,
  p_booking_date DATE,
  p_booking_time TIME,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_hold_minutes INTEGER DEFAULT 10
)
RETURNS TABLE(hold_id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.booking_slot_holds%ROWTYPE;
  v_expires TIMESTAMPTZ;
  v_available BOOLEAN;
  v_is_service_role BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF NOT v_is_service_role AND NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id
      AND company_id = p_company_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cliente inválido para esta sessão.';
  END IF;

  IF p_hold_minutes < 1 OR p_hold_minutes > 30 THEN
    RAISE EXCEPTION 'Tempo de hold inválido.';
  END IF;

  v_expires := now() + make_interval(mins => p_hold_minutes);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', p_company_id::TEXT, p_employee_id::TEXT, p_booking_date::TEXT),
      0
    )
  );

  UPDATE public.booking_slot_holds
     SET status = 'expired', updated_at = now()
   WHERE company_id = p_company_id
     AND employee_id = p_employee_id
     AND status = 'active'
     AND expires_at <= now();

  SELECT * INTO v_hold
    FROM public.booking_slot_holds
   WHERE company_id = p_company_id
     AND employee_id = p_employee_id
     AND booking_date = p_booking_date
     AND booking_time = p_booking_time
     AND client_id = p_client_id
     AND status = 'active'
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT v_hold.id, v_hold.expires_at;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.get_available_slots(
        p_company_id, p_employee_id, p_service_id, p_booking_date, FALSE
      ) s
     WHERE s.slot = p_booking_time
  ) INTO v_available;

  IF NOT v_available THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Esse horário acabou de ser reservado por outra pessoa.',
      DETAIL = 'slot_already_held',
      ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.booking_slot_holds (
    company_id, employee_id, service_id, client_id,
    booking_date, booking_time, start_time, end_time,
    status, expires_at
  )
  VALUES (
    p_company_id, p_employee_id, p_service_id, p_client_id,
    p_booking_date, p_booking_time, p_start_time, p_end_time,
    'active', v_expires
  )
  RETURNING * INTO v_hold;

  RETURN QUERY SELECT v_hold.id, v_hold.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_online_booking_payment(
  p_hold_id UUID,
  p_payment_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.booking_slot_holds%ROWTYPE;
  v_booking_id UUID;
  v_payment public.booking_payments%ROWTYPE;
  v_is_service_role BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  SELECT * INTO v_payment
    FROM public.booking_payments
   WHERE asaas_id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;

  IF v_payment.booking_id IS NOT NULL THEN
    RETURN v_payment.booking_id;
  END IF;

  SELECT * INTO v_hold
    FROM public.booking_slot_holds
   WHERE id = p_hold_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold de horário inválido.';
  END IF;

  IF NOT v_is_service_role AND v_hold.client_id NOT IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Hold de horário inválido.';
  END IF;

  IF v_hold.status <> 'active' OR v_hold.expires_at <= now() THEN
    UPDATE public.booking_slot_holds
       SET status = 'expired', updated_at = now()
     WHERE id = v_hold.id;
    RAISE EXCEPTION USING
      MESSAGE = 'O tempo para concluir a reserva acabou. O horário foi liberado.',
      DETAIL = 'hold_expired',
      ERRCODE = 'P0001';
  END IF;

  IF v_payment.company_id <> v_hold.company_id
     OR COALESCE((v_payment.metadata->>'client_id'), '') <> v_hold.client_id::TEXT THEN
    RAISE EXCEPTION 'Pagamento não corresponde ao hold do cliente.';
  END IF;

  IF LOWER(COALESCE(v_payment.status::TEXT,'')) NOT IN ('paid','confirmed','received') THEN
    RAISE EXCEPTION 'Pagamento ainda não confirmado.';
  END IF;

  INSERT INTO public.bookings (
    company_id, employee_id, service_id, client_id,
    booking_time, start_time, end_time, booking_date,
    duration_minutes, price, notes, created_source,
    booking_status, payment_status, payment_method
  )
  VALUES (
    v_hold.company_id, v_hold.employee_id, v_hold.service_id, v_hold.client_id,
    v_hold.booking_time, v_hold.start_time, v_hold.end_time, v_hold.booking_date,
    GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_hold.end_time - v_hold.start_time)) / 60)::INT),
    v_payment.amount,
    COALESCE((v_payment.metadata->'booking_data'->>'notes'), ''),
    'landingpage', 'confirmed', 'confirmed', 'online'
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.booking_payments
     SET booking_id = v_booking_id,
         status = 'confirmed',
         updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.booking_slot_holds
     SET status = 'converted', updated_at = now()
   WHERE id = v_hold.id;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_online_booking_hold(UUID,UUID,UUID,UUID,DATE,TIME,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_online_booking_hold(UUID,UUID,UUID,UUID,DATE,TIME,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_online_booking_payment(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_online_booking_payment(UUID,TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 2182 — Hold atômico de horário para pagamento online
-- Um hold temporário protege o slot durante o checkout sem bloquear pagamento local.
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
  ON public.booking_slot_holds FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF NOT EXISTS (
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

  -- Serializa todos os holds do mesmo profissional/dia.
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

  -- Idempotência: o mesmo cliente pode repetir a chamada sem criar dois holds.
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
BEGIN
  IF auth.uid() IS NULL THEN
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

  IF NOT FOUND OR v_hold.client_id NOT IN (
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

-- Faz get_available_slots considerar holds online ativos.
DO $$
DECLARE
  v_def TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_available_slots(uuid,uuid,uuid,date,boolean)'::regprocedure
  ) INTO v_def;

  v_old := $needle$
  v_eb_s       TIME[] := ARRAY[]::TIME[];
  v_eb_e       TIME[] := ARRAY[]::TIME[];
  v_i          INT;
$needle$;

  v_new := $replacement$
  v_eb_s       TIME[] := ARRAY[]::TIME[];
  v_eb_e       TIME[] := ARRAY[]::TIME[];
  v_hold_s     TIME[] := ARRAY[]::TIME[];
  v_hold_e     TIME[] := ARRAY[]::TIME[];
  v_i          INT;
$replacement$;

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Declarações esperadas de get_available_slots não encontradas.';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $needle$
  SELECT
    COALESCE(ARRAY_AGG(bstart), ARRAY[]::TIME[]),
    COALESCE(ARRAY_AGG(bend),   ARRAY[]::TIME[])
  INTO v_eb_s, v_eb_e
  FROM (
$needle$;

  v_new := $replacement$
  SELECT
    COALESCE(ARRAY_AGG(bstart), ARRAY[]::TIME[]),
    COALESCE(ARRAY_AGG(bend),   ARRAY[]::TIME[])
  INTO v_eb_s, v_eb_e
  FROM (
$replacement$;

  -- Injeta a leitura dos holds imediatamente antes dos breaks.
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Bloco de employee_breaks não encontrado em get_available_slots.';
  END IF;

  v_def := replace(v_def, v_old, $inject$
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

  $inject$ || v_old);

  v_old := $needle$
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
$needle$;

  v_new := $replacement$
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

    slot   := v_cur;
$replacement$;

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Loop de conflitos de bookings não encontrado em get_available_slots.';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  EXECUTE v_def;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

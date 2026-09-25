-- 2181: pagamento no local pendente não ocupa o horário.
-- Somente agendamentos confirmados (ou outros estados efetivamente ativos)
-- bloqueiam disponibilidade. O pagamento no local permanece pendente no painel
-- até a empresa confirmar.
BEGIN;

DO $$
DECLARE
  v_def TEXT;
  v_old TEXT := $needle$
      AND LOWER(COALESCE(bk.booking_status::text,''))
          NOT IN ('cancelled','canceled','rejected','no_show')
$needle$;
  v_new TEXT := $replacement$
      AND LOWER(COALESCE(bk.booking_status::text,''))
          NOT IN ('cancelled','canceled','rejected','no_show')
      AND NOT (
        LOWER(COALESCE(bk.booking_status::text,'')) = 'pending'
        AND LOWER(COALESCE(bk.payment_method::text,'')) = 'local'
      )
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_available_slots(uuid,uuid,uuid,date,boolean)'::regprocedure
  ) INTO v_def;

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar o filtro de bookings de get_available_slots.';
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END $$;

-- Confirmação do pagamento no local:
-- 1. valida permissão;
-- 2. trava o slot com advisory lock para evitar duas confirmações simultâneas;
-- 3. revalida disponibilidade;
-- 4. somente então muda pending/local -> confirmed.
CREATE OR REPLACE FUNCTION public.confirm_local_booking(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_booking_time TIME;
  v_available BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Não autenticado.',
      ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Agendamento não encontrado.',
      DETAIL = 'booking_not_found',
      ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.user_has_company_permission(v_booking.company_id, 'bookings.edit')
    OR public.user_has_company_permission(v_booking.company_id, 'bookings.manage_all')
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Você não tem permissão para confirmar este agendamento.',
      DETAIL = 'booking_confirm_permission_denied',
      ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(v_booking.booking_status::TEXT, '')) <> 'pending'
     OR LOWER(COALESCE(v_booking.payment_method::TEXT, '')) <> 'local' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Somente agendamentos pendentes com pagamento no local podem ser confirmados.',
      DETAIL = 'booking_not_local_pending',
      ERRCODE = 'P0001';
  END IF;

  v_booking_time := COALESCE(
    v_booking.booking_time,
    (v_booking.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME
  );

  -- Mesmo slot, mesma empresa/profissional/data: confirmações concorrentes
  -- passam por uma única sequência.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        v_booking.company_id::TEXT,
        v_booking.employee_id::TEXT,
        v_booking.booking_date::TEXT,
        v_booking_time::TEXT
      ),
      0
    )
  );

  SELECT EXISTS (
    SELECT 1
      FROM public.get_available_slots(
        v_booking.company_id,
        v_booking.employee_id,
        v_booking.service_id,
        v_booking.booking_date,
        TRUE
      ) gs
     WHERE gs.slot = v_booking_time
  )
  INTO v_available;

  IF NOT v_available THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Esse horário não está mais disponível.',
      DETAIL = 'slot_unavailable_on_confirmation',
      ERRCODE = 'P0001';
  END IF;

  UPDATE public.bookings
     SET booking_status = 'confirmed',
         updated_at = now()
   WHERE id = v_booking.id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_local_booking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_local_booking(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

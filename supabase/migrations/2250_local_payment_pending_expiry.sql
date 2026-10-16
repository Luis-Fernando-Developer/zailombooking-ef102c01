-- 2250 — expiração configurável de solicitações de pagamento no local.
-- O prazo padrão é 120 minutos. As configurações ficam em companies.booking_settings.
-- A expiração é aplicada no banco para não depender exclusivamente do worker.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS local_payment_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS local_payment_expired_at TIMESTAMPTZ;

-- Valores padrão explícitos para todas as empresas existentes.
UPDATE public.companies
SET booking_settings = COALESCE(booking_settings, '{}'::jsonb)
  || jsonb_build_object(
       'local_payment_expiry_enabled',
       COALESCE((booking_settings->>'local_payment_expiry_enabled')::boolean, true),
       'local_payment_expiry_minutes',
       CASE
         WHEN COALESCE(booking_settings->>'local_payment_expiry_minutes', '') ~ '^\d+$'
           AND (booking_settings->>'local_payment_expiry_minutes')::integer BETWEEN 5 AND 1440
         THEN (booking_settings->>'local_payment_expiry_minutes')::integer
         ELSE 120
       END,
       'local_payment_expiry_notify_client',
       COALESCE((booking_settings->>'local_payment_expiry_notify_client')::boolean, true)
     )
WHERE booking_settings IS NULL
   OR NOT (booking_settings ? 'local_payment_expiry_enabled')
   OR NOT (booking_settings ? 'local_payment_expiry_minutes')
   OR NOT (booking_settings ? 'local_payment_expiry_notify_client');

-- Compatibilidade: pedidos locais pendentes antigos recebem prazo com base
-- na criação original, respeitando a configuração atual da empresa.
UPDATE public.bookings b
SET local_payment_expires_at =
      b.created_at + make_interval(mins => CASE
        WHEN COALESCE(c.booking_settings->>'local_payment_expiry_minutes', '') ~ '^\d+$'
          AND (c.booking_settings->>'local_payment_expiry_minutes')::integer BETWEEN 5 AND 1440
        THEN (c.booking_settings->>'local_payment_expiry_minutes')::integer
        ELSE 120
      END)
FROM public.companies c
WHERE c.id = b.company_id
  AND LOWER(COALESCE(b.booking_status::text, '')) = 'pending'
  AND LOWER(COALESCE(b.payment_method::text, '')) = 'local'
  AND b.local_payment_expires_at IS NULL
  AND COALESCE((c.booking_settings->>'local_payment_expiry_enabled')::boolean, true);

CREATE INDEX IF NOT EXISTS idx_bookings_local_payment_expiry
  ON public.bookings (local_payment_expires_at)
  WHERE LOWER(COALESCE(booking_status::text, '')) = 'pending'
    AND LOWER(COALESCE(payment_method::text, '')) = 'local';

CREATE OR REPLACE FUNCTION public.set_local_booking_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_enabled BOOLEAN;
  v_minutes INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND LOWER(COALESCE(OLD.booking_status::text, '')) = 'pending'
     AND LOWER(COALESCE(OLD.payment_method::text, '')) = 'local'
     AND LOWER(COALESCE(NEW.booking_status::text, '')) = 'confirmed'
     AND OLD.local_payment_expires_at IS NOT NULL
     AND OLD.local_payment_expires_at <= now() THEN
    RAISE EXCEPTION USING
      MESSAGE = 'O prazo para confirmar este agendamento expirou.',
      DETAIL = 'local_booking_expired',
      ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(NEW.booking_status::text, '')) <> 'pending'
     OR LOWER(COALESCE(NEW.payment_method::text, '')) <> 'local' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(c.booking_settings, '{}'::jsonb)
    INTO v_settings
    FROM public.companies c
   WHERE c.id = NEW.company_id;

  v_enabled := COALESCE((v_settings->>'local_payment_expiry_enabled')::boolean, true);
  v_minutes := CASE
    WHEN COALESCE(v_settings->>'local_payment_expiry_minutes', '') ~ '^\d+$'
      AND (v_settings->>'local_payment_expiry_minutes')::integer BETWEEN 5 AND 1440
    THEN (v_settings->>'local_payment_expiry_minutes')::integer
    ELSE 120
  END;

  IF v_enabled THEN
    NEW.local_payment_expires_at := COALESCE(
      NEW.local_payment_expires_at,
      now() + make_interval(mins => v_minutes)
    );
  ELSE
    NEW.local_payment_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_local_booking_expiry ON public.bookings;
CREATE TRIGGER trg_set_local_booking_expiry
BEFORE INSERT OR UPDATE OF booking_status, payment_method, company_id
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_local_booking_expiry();

-- Worker de serviço: expira pedidos vencidos de forma idempotente e devolve
-- apenas os pedidos alterados nesta execução para evitar notificações duplicadas.
CREATE OR REPLACE FUNCTION public.expire_pending_local_bookings()
RETURNS TABLE (
  booking_id UUID,
  company_id UUID,
  notify_client BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Pedidos legados sem data de expiração recebem prazo a partir da criação.
  UPDATE public.bookings b
     SET local_payment_expires_at =
       b.created_at + make_interval(mins => CASE
         WHEN COALESCE(c.booking_settings->>'local_payment_expiry_minutes', '') ~ '^\\d+$'
          AND (c.booking_settings->>'local_payment_expiry_minutes')::integer BETWEEN 5 AND 1440
         THEN (c.booking_settings->>'local_payment_expiry_minutes')::integer
         ELSE 120
       END)
    FROM public.companies c
   WHERE c.id = b.company_id
     AND LOWER(COALESCE(b.booking_status::text, '')) = 'pending'
     AND LOWER(COALESCE(b.payment_method::text, '')) = 'local'
     AND b.local_payment_expires_at IS NULL
     AND COALESCE((c.booking_settings->>'local_payment_expiry_enabled')::boolean, true);

  RETURN QUERY
  WITH expired AS (
    UPDATE public.bookings b
       SET booking_status = 'cancelled',
           local_payment_expired_at = now(),
           updated_at = now(),
           notes = concat_ws(E'\\n', NULLIF(b.notes, ''), 'Cancelado automaticamente: prazo para pagamento no local expirado.')
      FROM public.companies c
     WHERE c.id = b.company_id
       AND LOWER(COALESCE(b.booking_status::text, '')) = 'pending'
       AND LOWER(COALESCE(b.payment_method::text, '')) = 'local'
       AND b.local_payment_expires_at IS NOT NULL
       AND b.local_payment_expires_at <= now()
       AND COALESCE((c.booking_settings->>'local_payment_expiry_enabled')::boolean, true)
    RETURNING b.id, b.company_id
  )
  SELECT expired.id,
         expired.company_id,
         COALESCE((c.booking_settings->>'local_payment_expiry_notify_client')::boolean, true)
    FROM expired
    JOIN public.companies c ON c.id = expired.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_pending_local_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_local_bookings() TO service_role;

-- Horários locais pendentes reservam o slot somente enquanto a política
-- estiver ativa e o prazo não tiver vencido. Desativar a política mantém o
-- comportamento legado de não bloquear slots com pagamento no local.
DO $$
DECLARE
  v_def TEXT;
  v_old TEXT := $needle$
      AND LOWER(COALESCE(bk.booking_status::text,''))
          NOT IN ('cancelled','canceled','rejected','no_show')
      AND NOT (
        LOWER(COALESCE(bk.booking_status::text,'')) = 'pending'
        AND LOWER(COALESCE(bk.payment_method::text,'')) = 'local'
      )
$needle$;
  v_new TEXT := $replacement$
      AND LOWER(COALESCE(bk.booking_status::text,''))
          NOT IN ('cancelled','canceled','rejected','no_show')
      AND NOT (
        LOWER(COALESCE(bk.booking_status::text,'')) = 'pending'
        AND LOWER(COALESCE(bk.payment_method::text,'')) = 'local'
        AND NOT (
          COALESCE((
            SELECT (co.booking_settings->>'local_payment_expiry_enabled')::boolean
              FROM public.companies co
             WHERE co.id = bk.company_id
          ), true)
          AND bk.local_payment_expires_at IS NOT NULL
          AND bk.local_payment_expires_at > now()
        )
      )
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_available_slots(uuid,uuid,uuid,date,boolean)'::regprocedure
  ) INTO v_def;

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar o filtro legado de pagamento local em get_available_slots.';
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END $$;

-- Confirmação segura de pedido local: valida permissão e prazo, trava o slot,
-- remove temporariamente o próprio pedido da consulta e revalida disponibilidade.
CREATE OR REPLACE FUNCTION public.confirm_local_booking(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_booking_time TIME;
  v_availability_service_id UUID;
  v_available BOOLEAN;
  v_duration INTEGER;
  v_has_conflict BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Não autenticado.', ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Agendamento não encontrado.', DETAIL = 'booking_not_found', ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.user_has_company_permission(v_booking.company_id, 'bookings.edit')
    OR public.user_has_company_permission(v_booking.company_id, 'bookings.manage_all')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Você não tem permissão para confirmar este agendamento.', DETAIL = 'booking_confirm_permission_denied', ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(v_booking.booking_status::text, '')) <> 'pending'
     OR LOWER(COALESCE(v_booking.payment_method::text, '')) <> 'local' THEN
    RAISE EXCEPTION USING MESSAGE = 'Somente agendamentos pendentes com pagamento no local podem ser confirmados.', DETAIL = 'booking_not_local_pending', ERRCODE = 'P0001';
  END IF;

  IF v_booking.local_payment_expires_at IS NOT NULL
     AND v_booking.local_payment_expires_at <= now() THEN
    RAISE EXCEPTION USING MESSAGE = 'O prazo para confirmar este agendamento expirou.', DETAIL = 'local_booking_expired', ERRCODE = 'P0001';
  END IF;

  v_booking_time := COALESCE(
    v_booking.booking_time,
    (v_booking.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME
  );
  v_duration := GREATEST(COALESCE(v_booking.duration_minutes, 30), 1);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', v_booking.company_id::TEXT, v_booking.employee_id::TEXT, v_booking.booking_date::TEXT, v_booking_time::TEXT),
      0
    )
  );

  -- Para combos, usa o primeiro serviço para validar a existência do horário;
  -- a sobreposição completa do combo é verificada separadamente abaixo.
  v_availability_service_id := v_booking.service_id;
  IF v_availability_service_id IS NULL AND v_booking.combo_id IS NOT NULL THEN
    SELECT sci.service_id INTO v_availability_service_id
      FROM public.service_combo_items sci
     WHERE sci.combo_id = v_booking.combo_id
     LIMIT 1;
  END IF;

  IF v_availability_service_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Não foi possível validar o serviço deste agendamento.', DETAIL = 'booking_service_missing', ERRCODE = 'P0001';
  END IF;

  -- Temporariamente cancela o próprio pedido dentro da transação para ele não
  -- entrar em conflito consigo mesmo. Qualquer exceção reverte essa alteração.
  UPDATE public.bookings
     SET booking_status = 'cancelled', updated_at = now()
   WHERE id = v_booking.id;

  SELECT EXISTS (
    SELECT 1
      FROM public.get_available_slots(
        v_booking.company_id,
        v_booking.employee_id,
        v_availability_service_id,
        v_booking.booking_date,
        TRUE
      ) gs
     WHERE gs.slot = v_booking_time
  ) INTO v_available;

  IF NOT v_available THEN
    RAISE EXCEPTION USING MESSAGE = 'Esse horário não está mais disponível.', DETAIL = 'slot_unavailable_on_confirmation', ERRCODE = 'P0001';
  END IF;

  -- Garante conflito de toda a duração do booking, inclusive combos cujo
  -- primeiro serviço seja mais curto que a duração total do pacote.
  SELECT EXISTS (
    SELECT 1
      FROM public.bookings other
     WHERE other.id <> v_booking.id
       AND other.company_id = v_booking.company_id
       AND other.employee_id = v_booking.employee_id
       AND other.booking_date = v_booking.booking_date
       AND LOWER(COALESCE(other.booking_status::text, '')) NOT IN ('cancelled','canceled','rejected','no_show')
       AND COALESCE(other.booking_time, (other.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME)
             < v_booking_time + make_interval(mins => v_duration)
       AND COALESCE(
             (other.end_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
             COALESCE(other.booking_time, (other.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME)
               + make_interval(mins => GREATEST(COALESCE(other.duration_minutes, 30), 1))
           ) > v_booking_time
  ) INTO v_has_conflict;

  IF v_has_conflict THEN
    RAISE EXCEPTION USING MESSAGE = 'Esse horário não está mais disponível.', DETAIL = 'slot_unavailable_on_confirmation', ERRCODE = 'P0001';
  END IF;

  UPDATE public.bookings
     SET booking_status = 'confirmed', updated_at = now()
   WHERE id = v_booking.id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_local_booking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_local_booking(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- 2054 — Usa booking_time como fonte de verdade local do agendamento.
--
-- Sintoma:
--   O bot confirma um horário (ex.: 08:00 em 20/07), mas a notificação e o
--   painel mostram horários/datas diferentes por causa de conversões de
--   timestamptz/session timezone.
--
-- Correção:
--   1) Garante bookings.booking_time como TIME literal escolhido pelo cliente.
--   2) Normaliza start_time/end_time sempre a partir de booking_date +
--      booking_time em America/Sao_Paulo (-03:00).
--   3) Corrige a notificação para formatar pelo booking_time; se faltar, extrai
--      start_time no fuso America/Sao_Paulo.
--   4) Corrige validação de no_show para extrair horário no mesmo fuso.
-- ============================================================================

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_time TIME;

CREATE OR REPLACE FUNCTION public.normalize_booking_local_datetime()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_time TIME;
  v_duration INT;
BEGIN
  IF NEW.booking_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_time IS NOT NULL THEN
    v_start_time := NEW.booking_time::TIME;
  ELSIF NEW.start_time IS NOT NULL THEN
    v_start_time := (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME;
    NEW.booking_time := v_start_time;
  ELSE
    RETURN NEW;
  END IF;

  v_duration := NEW.duration_minutes;

  IF v_duration IS NULL AND NEW.service_id IS NOT NULL THEN
    SELECT COALESCE(s.duration_minutes, 30)
      INTO v_duration
      FROM public.services s
     WHERE s.id = NEW.service_id
     LIMIT 1;
  END IF;

  v_duration := COALESCE(v_duration, 30);
  NEW.duration_minutes := COALESCE(NEW.duration_minutes, v_duration);

  NEW.booking_time := v_start_time;
  NEW.start_time := (NEW.booking_date::TEXT || ' ' || v_start_time::TEXT || '-03')::TIMESTAMPTZ;
  NEW.end_time := NEW.start_time + (v_duration || ' minutes')::INTERVAL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_booking_local_datetime ON public.bookings;
CREATE TRIGGER trg_normalize_booking_local_datetime
BEFORE INSERT OR UPDATE OF booking_date, booking_time, start_time, end_time, duration_minutes, service_id
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.normalize_booking_local_datetime();

CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_local_time TIME;
BEGIN
  SELECT name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
  v_local_time := COALESCE(NEW.booking_time, (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME);

  INSERT INTO public.company_notifications (company_id, type, title, message, link, metadata)
  VALUES (
    NEW.company_id,
    'booking_created',
    'Novo agendamento',
    COALESCE(v_client_name, 'Cliente') || ' agendou para ' ||
      to_char(NEW.booking_date, 'DD/MM') || ' às ' || to_char(v_local_time, 'HH24:MI'),
    '/admin/agendamentos?bookingId=' || NEW.id::TEXT,
    jsonb_build_object('booking_id', NEW.id, 'client_id', NEW.client_id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_booking_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_no_show_keys TEXT[] := ARRAY[
    'booking_date', 'booking_time', 'start_time', 'end_time', 'employee_id',
    'service_id', 'booking_status', 'updated_at'
  ];
  v_allowed_finalize_keys TEXT[] := ARRAY[
    'booking_status', 'cancellation_reason', 'updated_at'
  ];
BEGIN
  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) NOT IN ('cancelled', 'canceled', 'completed', 'no_show')
     AND LOWER(COALESCE(NEW.booking_status::TEXT, '')) IN ('cancelled', 'canceled', 'completed', 'no_show')
     AND (to_jsonb(NEW) - v_allowed_finalize_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_finalize_keys) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Ao cancelar, concluir ou marcar não compareceu, apenas o status pode ser alterado.',
      DETAIL  = 'booking_finalize_status_only',
      ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) IN ('cancelled', 'canceled', 'completed')
     AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Agendamento cancelado ou concluído é imutável.',
      DETAIL  = 'booking_locked_final_status',
      ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) = 'no_show' THEN
    IF (to_jsonb(NEW) - v_allowed_no_show_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_no_show_keys) THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Agendamento marcado como não compareceu só pode ser reagendado.',
        DETAIL  = 'booking_no_show_allows_only_reschedule',
        ERRCODE = 'P0001';
    END IF;

    IF LOWER(COALESCE(NEW.booking_status::TEXT, '')) NOT IN ('no_show', 'confirmed', 'pending') THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Não compareceu só pode permanecer como está ou voltar para confirmado/pendente ao reagendar.',
        DETAIL  = 'booking_no_show_invalid_next_status',
        ERRCODE = 'P0001';
    END IF;

    IF NEW.booking_date IS NOT DISTINCT FROM OLD.booking_date
       AND COALESCE(NEW.booking_time, (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME)
           IS NOT DISTINCT FROM COALESCE(OLD.booking_time, (OLD.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME)
       AND NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Para alterar um não comparecimento, escolha uma nova data, horário ou profissional.',
        DETAIL  = 'booking_no_show_requires_new_slot',
        ERRCODE = 'P0001';
    END IF;

    IF NOT public.is_slot_available(
      OLD.company_id,
      COALESCE(NEW.employee_id, OLD.employee_id),
      COALESCE(NEW.service_id, OLD.service_id),
      NEW.booking_date,
      COALESCE(NEW.booking_time, (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME),
      OLD.id
    ) THEN
      RAISE EXCEPTION USING
        MESSAGE = 'O novo horário não está disponível na escala atual.',
        DETAIL  = 'booking_no_show_slot_unavailable',
        ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Repara notificações antigas quando o booking já possui booking_time correto.
UPDATE public.company_notifications cn
   SET message = COALESCE(c.name, 'Cliente') || ' agendou para ' ||
                 to_char(b.booking_date, 'DD/MM') || ' às ' ||
                 to_char(COALESCE(b.booking_time, (b.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME), 'HH24:MI')
  FROM public.bookings b
  LEFT JOIN public.clients c ON c.id = b.client_id
 WHERE cn.type = 'booking_created'
   AND cn.metadata ? 'booking_id'
   AND (cn.metadata->>'booking_id')::UUID = b.id;

NOTIFY pgrst, 'reload schema';

COMMIT;
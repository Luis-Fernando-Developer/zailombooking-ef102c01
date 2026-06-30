-- ============================================================================
-- 2043 — Agendamentos: notificações PT-BR, bloqueio de status finais e no-show
--
-- Deploy manual no Supabase EXTERNO.
-- Edge Function alterada: notify-booking-change deve ser redeployada com
-- verify-jwt DESATIVADO (--no-verify-jwt), mantendo a validação interna.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ptbr_request_type(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE LOWER(COALESCE(p_type, ''))
    WHEN 'schedule_change' THEN 'Alteração de escala'
    WHEN 'absence_request' THEN 'Solicitação de ausência'
    WHEN 'overtime_request' THEN 'Solicitação de hora extra'
    WHEN 'marketing_campaign' THEN 'Campanha de marketing'
    ELSE COALESCE(p_type, 'Solicitação')
  END
$$;

CREATE OR REPLACE FUNCTION public.ptbr_request_status(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE LOWER(COALESCE(p_status, ''))
    WHEN 'pending' THEN 'Pendente'
    WHEN 'in_review' THEN 'Em revisão'
    WHEN 'approved' THEN 'Aprovada'
    WHEN 'partially_approved' THEN 'Parcialmente aprovada'
    WHEN 'rejected' THEN 'Rejeitada'
    WHEN 'cancelled' THEN 'Cancelada'
    WHEN 'canceled' THEN 'Cancelada'
    ELSE COALESCE(p_status, 'Atualizada')
  END
$$;

CREATE OR REPLACE FUNCTION public.notify_request_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_name TEXT;
BEGIN
  SELECT name INTO v_emp_name
  FROM public.employees
  WHERE user_id = NEW.created_by
    AND company_id = NEW.tenant_id
  LIMIT 1;

  INSERT INTO public.company_notifications (company_id, type, title, message, link, metadata)
  VALUES (
    NEW.tenant_id,
    'request_created',
    'Nova solicitação',
    COALESCE(v_emp_name, 'Colaborador') || ' criou uma solicitação (' || public.ptbr_request_type(NEW.request_type) || ')',
    '/admin/solicitacoes?request=' || NEW.id,
    jsonb_build_object('request_id', NEW.id, 'request_type', NEW.request_type)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_request_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.company_notifications (company_id, type, title, message, link, metadata)
    VALUES (
      NEW.tenant_id,
      'request_status_changed',
      'Solicitação atualizada',
      'Status alterado para: ' || public.ptbr_request_status(NEW.status),
      '/admin/solicitacoes?request=' || NEW.id,
      jsonb_build_object('request_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.company_notifications
   SET message = regexp_replace(
     message,
     '\((schedule_change|absence_request|overtime_request|marketing_campaign)\)',
     '(' || public.ptbr_request_type(metadata->>'request_type') || ')',
     'gi'
   )
 WHERE type = 'request_created'
   AND metadata ? 'request_type';

UPDATE public.company_notifications
   SET message = 'Status alterado para: ' || public.ptbr_request_status(metadata->>'new_status')
 WHERE type = 'request_status_changed'
   AND metadata ? 'new_status';

CREATE OR REPLACE FUNCTION public.prevent_locked_booking_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_no_show_keys TEXT[] := ARRAY[
    'booking_date', 'start_time', 'end_time', 'employee_id', 'service_id',
    'booking_status', 'updated_at'
  ];
BEGIN
  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) IN ('cancelled', 'canceled', 'completed')
     AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'booking_locked_final_status'
      USING MESSAGE = 'Agendamento cancelado ou concluído é imutável.';
  END IF;

  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) = 'no_show' THEN
    IF (to_jsonb(NEW) - v_allowed_no_show_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_no_show_keys) THEN
      RAISE EXCEPTION 'booking_no_show_allows_only_reschedule'
        USING MESSAGE = 'Agendamento marcado como não compareceu só pode ser reagendado.';
    END IF;

    IF LOWER(COALESCE(NEW.booking_status::TEXT, '')) NOT IN ('no_show', 'confirmed', 'pending') THEN
      RAISE EXCEPTION 'booking_no_show_invalid_next_status'
        USING MESSAGE = 'Não compareceu só pode permanecer como está ou voltar para confirmado/pendente ao reagendar.';
    END IF;

    IF NEW.booking_date IS NOT DISTINCT FROM OLD.booking_date
       AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
       AND NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id THEN
      RAISE EXCEPTION 'booking_no_show_requires_new_slot'
        USING MESSAGE = 'Para alterar um não comparecimento, escolha uma nova data, horário ou profissional.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_booking_update ON public.bookings;
CREATE TRIGGER trg_prevent_locked_booking_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_booking_update();

CREATE OR REPLACE FUNCTION public.client_reschedule_booking(
  p_booking_id uuid,
  p_new_date date,
  p_new_start time,
  p_new_employee uuid DEFAULT NULL,
  p_new_service uuid DEFAULT NULL
) RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.bookings;
  v_new public.bookings;
  v_duration int;
  v_end time;
  v_emp uuid;
  v_svc uuid;
BEGIN
  SELECT b.* INTO v_old
    FROM public.bookings b
    JOIN public.clients c ON c.id = b.client_id
   WHERE b.id = p_booking_id
     AND c.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF LOWER(COALESCE(v_old.booking_status::TEXT, '')) IN ('completed', 'cancelled', 'canceled', 'in_progress') THEN
    RAISE EXCEPTION 'booking_locked';
  END IF;

  v_emp := COALESCE(p_new_employee, v_old.employee_id);
  v_svc := COALESCE(p_new_service, v_old.service_id);

  IF NOT public.is_slot_available(v_old.company_id, v_emp, v_svc, p_new_date, p_new_start, p_booking_id) THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  SELECT COALESCE(duration_minutes, 30) INTO v_duration
    FROM public.services
   WHERE id = v_svc;

  v_end := (p_new_start::INTERVAL + (COALESCE(v_duration, 30) || ' min')::INTERVAL)::TIME;

  UPDATE public.bookings
     SET booking_date = p_new_date,
         start_time = p_new_start,
         end_time = v_end,
         employee_id = v_emp,
         service_id = v_svc,
         booking_status = CASE
           WHEN LOWER(COALESCE(v_old.booking_status::TEXT, '')) = 'no_show' THEN 'confirmed'
           ELSE booking_status
         END,
         updated_at = NOW()
   WHERE id = p_booking_id
   RETURNING * INTO v_new;

  INSERT INTO public.booking_history(booking_id, changed_by, change_type, old_data, new_data)
  VALUES (p_booking_id, auth.uid(), 'reschedule', to_jsonb(v_old), to_jsonb(v_new));

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_reschedule_booking(uuid,date,time,uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
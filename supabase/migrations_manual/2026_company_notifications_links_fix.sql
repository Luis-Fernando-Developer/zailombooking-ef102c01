-- ============================================================================
-- Corrige links das notificações de empresa para usar rotas reais do app
-- e incluir o id do recurso como query param para filtragem direta.
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
BEGIN
  SELECT name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;

  INSERT INTO public.company_notifications (company_id, type, title, message, link, metadata)
  VALUES (
    NEW.company_id,
    'booking_created',
    'Novo agendamento',
    COALESCE(v_client_name, 'Cliente') || ' agendou para ' ||
      to_char(NEW.booking_date, 'DD/MM') || ' às ' || to_char(NEW.start_time, 'HH24:MI'),
    '/admin/agendamentos?bookingId=' || NEW.id::text,
    jsonb_build_object('booking_id', NEW.id, 'client_id', NEW.client_id)
  );
  RETURN NEW;
END;
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
  SELECT name INTO v_emp_name FROM public.employees WHERE user_id = NEW.created_by LIMIT 1;

  INSERT INTO public.company_notifications (company_id, type, title, message, link, metadata)
  VALUES (
    NEW.tenant_id,
    'request_created',
    'Nova solicitação',
    COALESCE(v_emp_name, 'Colaborador') || ' criou uma solicitação (' || COALESCE(NEW.request_type, 'geral') || ')',
    '/admin/solicitacoes?requestId=' || NEW.id::text,
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
      'Status alterado para: ' || NEW.status,
      '/admin/solicitacoes?requestId=' || NEW.id::text,
      jsonb_build_object('request_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: corrige links antigos já gravados
UPDATE public.company_notifications
SET link = '/admin/agendamentos?bookingId=' || (metadata->>'booking_id')
WHERE type = 'booking_created'
  AND metadata ? 'booking_id'
  AND (link IS NULL OR link NOT LIKE '/admin/agendamentos%');

UPDATE public.company_notifications
SET link = '/admin/solicitacoes?requestId=' || (metadata->>'request_id')
WHERE type IN ('request_created','request_status_changed')
  AND metadata ? 'request_id'
  AND (link IS NULL OR link NOT LIKE '/admin/solicitacoes%');

NOTIFY pgrst, 'reload schema';

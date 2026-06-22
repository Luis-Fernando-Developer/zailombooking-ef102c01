-- ============================================================================
-- Triggers que populam public.company_notifications automaticamente.
-- Rodar APÓS 2026_company_notifications.sql, 2026_solicitacoes.sql e
-- depois que a tabela public.bookings existir.
-- Idempotente: pode rodar várias vezes.
-- ============================================================================

-- ---------- 1) Novo agendamento (bookings) ----------------------------------
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
    '/business/bookings',
    jsonb_build_object('booking_id', NEW.id, 'client_id', NEW.client_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_created ON public.bookings;
CREATE TRIGGER trg_notify_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_created();

-- ---------- 2) Nova solicitação (requests) ----------------------------------
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
    '/business/requests',
    jsonb_build_object('request_id', NEW.id, 'request_type', NEW.request_type)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_created ON public.requests;
CREATE TRIGGER trg_notify_request_created
  AFTER INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_request_created();

-- ---------- 3) Mudança de status de solicitação -----------------------------
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
      NEW.company_id,
      'request_status_changed',
      'Solicitação atualizada',
      'Status alterado para: ' || NEW.status,
      '/business/requests',
      jsonb_build_object('request_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_status_changed ON public.requests;
CREATE TRIGGER trg_notify_request_status_changed
  AFTER UPDATE OF status ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_request_status_changed();

NOTIFY pgrst, 'reload schema';

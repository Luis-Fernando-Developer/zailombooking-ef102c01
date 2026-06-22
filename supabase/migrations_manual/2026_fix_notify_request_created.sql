-- Fix: trigger notify_request_created referenciava NEW.employee_id, que não existe
-- em public.requests (a coluna correta é created_by -> auth.users).
-- Erro original: record "new" has no field "employee_id" (SQLSTATE 42703)

CREATE OR REPLACE FUNCTION public.notify_request_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_name TEXT;
  v_company_id UUID;
BEGIN
  -- Tenta resolver nome do colaborador a partir do created_by (user_id)
  SELECT name INTO v_emp_name
  FROM public.employees
  WHERE user_id = NEW.created_by
  LIMIT 1;

  -- company_id: usa tenant_id se existir na linha
  v_company_id := NEW.tenant_id;

  INSERT INTO public.company_notifications (company_id, type, title, message, link, metadata)
  VALUES (
    v_company_id,
    'request_created',
    'Nova solicitação',
    COALESCE(v_emp_name, 'Colaborador') || ' criou uma solicitação ('
      || COALESCE(NEW.request_type, 'geral') || ')',
    '/business/requests',
    jsonb_build_object(
      'request_id', NEW.id,
      'request_type', NEW.request_type
    )
  );
  RETURN NEW;
END;
$$;

-- Também corrige o de status: a tabela usa tenant_id, não company_id
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
      '/business/requests',
      jsonb_build_object('request_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Protege employee_permissions no banco.
-- O próprio colaborador nunca pode alterar as próprias permissões.
-- Para alterar permissões de outro colaborador, é necessário
-- employees.manage_permissions (ou owner).

CREATE OR REPLACE FUNCTION public.guard_employee_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actor_employee_id uuid;
  v_actor_company_id uuid;
  v_actor_role text;
  v_target_employee_id uuid;
  v_target_company_id uuid;
  v_allowed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_target_employee_id := COALESCE(NEW.employee_id, OLD.employee_id);

  SELECT e.id, e.company_id, e.role
    INTO v_actor_employee_id, v_actor_company_id, v_actor_role
  FROM public.employees e
  WHERE e.user_id = v_user_id
    AND e.is_active = true
  ORDER BY CASE WHEN e.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT e.company_id
    INTO v_target_company_id
  FROM public.employees e
  WHERE e.id = v_target_employee_id;

  IF v_target_company_id IS NULL OR v_actor_company_id IS NULL
     OR v_target_company_id <> v_actor_company_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_actor_employee_id = v_target_employee_id THEN
    RAISE EXCEPTION 'Employees cannot change their own permissions';
  END IF;

  IF v_actor_role = 'owner' THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.employee_permissions ep
      JOIN public.permissions p ON p.id = ep.permission_id
      WHERE ep.employee_id = v_actor_employee_id
        AND p.code = 'employees.manage_permissions'
        AND p.is_active = true
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Permission denied: employees.manage_permissions';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_permission_change
ON public.employee_permissions;

CREATE TRIGGER trg_guard_employee_permission_change
BEFORE INSERT OR UPDATE OR DELETE
ON public.employee_permissions
FOR EACH ROW
EXECUTE FUNCTION public.guard_employee_permission_change();

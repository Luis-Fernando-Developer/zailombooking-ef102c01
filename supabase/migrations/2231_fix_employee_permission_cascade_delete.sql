-- Corrige exclusão de colaboradores com permissões granulares.
-- Durante ON DELETE CASCADE, o registro pai em employees já não existe.
-- Permite somente esse DELETE derivado da exclusão do pai; alterações diretas
-- em employee_permissions continuam sujeitas à validação de autorização.
BEGIN;

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
  -- A exclusão em cascata do colaborador não tem contexto auth.uid() e o
  -- colaborador pai já foi removido. Permite somente a limpeza dos filhos.
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (
       SELECT 1
       FROM public.employees e
       WHERE e.id = OLD.employee_id
     ) THEN
    RETURN OLD;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_target_employee_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.employee_id
    ELSE NEW.employee_id
  END;

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

  IF v_actor_role IN ('owner', 'admin') THEN
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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

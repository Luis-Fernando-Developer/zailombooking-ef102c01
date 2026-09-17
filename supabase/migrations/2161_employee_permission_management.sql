-- FASE RH: controle específico para editar permissões de outros colaboradores.
-- O colaborador nunca pode alterar as próprias permissões.

INSERT INTO public.permissions (code, name, description, module, is_active, sort_order)
VALUES (
  'employees.manage_permissions',
  'Gerenciar permissões de colaboradores',
  'Permite alterar as permissões de acesso de outros colaboradores.',
  'employees',
  true,
  50
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.permission_presets (code, name, description, is_active, sort_order)
VALUES (
  'gerenciar_permissoes',
  'Gerenciar Permissões',
  'Permite alterar as permissões de acesso de outros colaboradores.',
  true,
  50
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.permission_preset_items (preset_id, permission_id)
SELECT pp.id, p.id
FROM public.permission_presets pp
CROSS JOIN public.permissions p
WHERE pp.code = 'gerenciar_permissoes'
  AND p.code = 'employees.manage_permissions'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_employee_permissions(
  p_target_employee_id uuid,
  p_permission_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_actor_employee_id uuid;
  v_actor_role text;
  v_target_company_id uuid;
  v_has_permission boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT e.id, e.company_id, e.role
    INTO v_actor_employee_id, v_company_id, v_actor_role
  FROM public.employees e
  WHERE e.user_id = v_user_id
    AND e.is_active = true
  ORDER BY CASE WHEN e.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
    FROM public.companies c
    WHERE lower(c.owner_email) = lower((SELECT email FROM auth.users WHERE id = v_user_id))
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company context not found';
  END IF;

  SELECT e.company_id
    INTO v_target_company_id
  FROM public.employees e
  WHERE e.id = p_target_employee_id;

  IF v_target_company_id IS NULL OR v_target_company_id <> v_company_id THEN
    RAISE EXCEPTION 'Employee does not belong to the current company';
  END IF;

  IF v_actor_employee_id = p_target_employee_id THEN
    RAISE EXCEPTION 'Employees cannot change their own permissions';
  END IF;

  IF v_actor_role = 'owner' THEN
    v_has_permission := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.employee_permissions ep
      JOIN public.permissions p ON p.id = ep.permission_id
      WHERE ep.employee_id = v_actor_employee_id
        AND p.code = 'employees.manage_permissions'
        AND p.is_active = true
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: employees.manage_permissions';
  END IF;

  DELETE FROM public.employee_permissions
  WHERE employee_id = p_target_employee_id;

  INSERT INTO public.employee_permissions (employee_id, permission_id)
  SELECT p_target_employee_id, p.id
  FROM public.permissions p
  WHERE p.id = ANY(COALESCE(p_permission_ids, ARRAY[]::uuid[]))
    AND p.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employee_permissions(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employee_permissions(uuid, uuid[]) TO authenticated;

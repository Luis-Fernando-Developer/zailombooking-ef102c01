-- 2263: corrigir gestão de permissões e tornar o cadastro recuperável após falhas parciais.
-- O contexto do ator é sempre avaliado na empresa do colaborador-alvo.
CREATE OR REPLACE FUNCTION public.guard_employee_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target_id uuid := COALESCE(NEW.employee_id, OLD.employee_id);
  v_company_id uuid;
  v_actor_role text;
  v_allowed boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.employees WHERE id = v_target_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Target employee not found';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.employees
  WHERE user_id = v_actor_id
    AND company_id = v_company_id
    AND is_active = true
  ORDER BY CASE WHEN role::text = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_actor_role::text IN ('owner','admin') THEN
    v_allowed := true;
  ELSIF public.user_has_company_permission(v_company_id, 'employees.manage_permissions') THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.companies c
    JOIN auth.users u ON lower(u.email) = lower(c.owner_email)
    WHERE c.id = v_company_id AND u.id = v_actor_id
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Permission denied: employees.manage_permissions';
  END IF;

  IF v_actor_id = (SELECT user_id FROM public.employees WHERE id = v_target_id) THEN
    RAISE EXCEPTION 'Employees cannot change their own permissions';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP POLICY IF EXISTS employee_permissions_insert_company ON public.employee_permissions;
CREATE POLICY employee_permissions_insert_company
ON public.employee_permissions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees target
    WHERE target.id = employee_permissions.employee_id
      AND (
        public.user_has_company_permission(target.company_id, 'employees.manage_permissions')
        OR EXISTS (
          SELECT 1 FROM public.employees actor
          WHERE actor.user_id = auth.uid()
            AND actor.company_id = target.company_id
            AND actor.is_active = true
            AND actor.role::text IN ('owner','admin')
        )
        OR EXISTS (
          SELECT 1 FROM public.companies c
          JOIN auth.users u ON lower(u.email) = lower(c.owner_email)
          WHERE c.id = target.company_id AND u.id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS employee_permissions_update_company ON public.employee_permissions;
CREATE POLICY employee_permissions_update_company
ON public.employee_permissions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees target
    WHERE target.id = employee_permissions.employee_id
      AND (
        public.user_has_company_permission(target.company_id, 'employees.manage_permissions')
        OR EXISTS (SELECT 1 FROM public.employees actor WHERE actor.user_id=auth.uid()
          AND actor.company_id=target.company_id AND actor.is_active=true
          AND actor.role::text IN ('owner','admin'))
        OR EXISTS (SELECT 1 FROM public.companies c JOIN auth.users u
          ON lower(u.email)=lower(c.owner_email)
          WHERE c.id=target.company_id AND u.id=auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees target
    WHERE target.id = employee_permissions.employee_id
      AND (
        public.user_has_company_permission(target.company_id, 'employees.manage_permissions')
        OR EXISTS (SELECT 1 FROM public.employees actor WHERE actor.user_id=auth.uid()
          AND actor.company_id=target.company_id AND actor.is_active=true
          AND actor.role::text IN ('owner','admin'))
        OR EXISTS (SELECT 1 FROM public.companies c JOIN auth.users u
          ON lower(u.email)=lower(c.owner_email)
          WHERE c.id=target.company_id AND u.id=auth.uid())
      )
  )
);

DROP POLICY IF EXISTS employee_permissions_delete_company ON public.employee_permissions;
CREATE POLICY employee_permissions_delete_company
ON public.employee_permissions FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees target
    WHERE target.id = employee_permissions.employee_id
      AND (
        public.user_has_company_permission(target.company_id, 'employees.manage_permissions')
        OR EXISTS (SELECT 1 FROM public.employees actor WHERE actor.user_id=auth.uid()
          AND actor.company_id=target.company_id AND actor.is_active=true
          AND actor.role::text IN ('owner','admin'))
        OR EXISTS (SELECT 1 FROM public.companies c JOIN auth.users u
          ON lower(u.email)=lower(c.owner_email)
          WHERE c.id=target.company_id AND u.id=auth.uid())
      )
  )
);

CREATE OR REPLACE FUNCTION public.assign_employee_permissions_for_company(
  p_company_id uuid,
  p_employee_id uuid,
  p_permission_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sessão necessária.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = p_employee_id AND company_id = p_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Colaborador não pertence a esta empresa.');
  END IF;

  SELECT role INTO v_role FROM public.employees
  WHERE user_id = auth.uid() AND company_id = p_company_id AND is_active = true
  ORDER BY CASE WHEN role::text='owner' THEN 0 ELSE 1 END LIMIT 1;

  v_allowed := v_role::text IN ('owner','admin')
    OR public.user_has_company_permission(p_company_id, 'employees.manage_permissions')
    OR EXISTS (
      SELECT 1 FROM public.companies c JOIN auth.users u
        ON lower(u.email)=lower(c.owner_email)
      WHERE c.id=p_company_id AND u.id=auth.uid()
    );

  IF NOT v_allowed THEN
    RETURN json_build_object('success', false, 'error', 'Sem permissão para gerenciar permissões.');
  END IF;

  DELETE FROM public.employee_permissions WHERE employee_id = p_employee_id;
  INSERT INTO public.employee_permissions(employee_id, permission_id)
  SELECT p_employee_id, p.id
  FROM public.permissions p
  WHERE p.id = ANY(COALESCE(p_permission_ids, ARRAY[]::uuid[]))
    AND p.is_active = true
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_employee_permissions_for_company(uuid,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_employee_permissions_for_company(uuid,uuid,uuid[]) TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.employee_permissions TO authenticated;
NOTIFY pgrst, 'reload schema';

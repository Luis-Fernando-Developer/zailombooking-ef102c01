-- FASE 12.1 — sincronização do núcleo de autorização da V2
-- A 2200 cria o catálogo/tabelas. Esta migration instala as functions
-- e guards usados pela V2 e troca as RLS principais para employee_permissions.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.current_employee_id(_company_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.company_id = _company_id
    AND e.is_active = true
  ORDER BY CASE WHEN e.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_is_company_member(_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid := auth.uid(); v_is_member boolean := false;
BEGIN
  IF v_user_id IS NULL OR _company_id IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id=v_user_id AND e.company_id=_company_id AND e.is_active=true
  ) OR EXISTS (
    SELECT 1 FROM public.companies c
    JOIN auth.users u ON lower(u.email)=lower(c.owner_email)
    WHERE c.id=_company_id AND u.id=v_user_id
  ) INTO v_is_member;
  RETURN COALESCE(v_is_member,false);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_company_permission(
  _company_id uuid, _permission_code text
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_employee_id uuid;
  v_role text;
BEGIN
  IF v_user_id IS NULL OR _company_id IS NULL OR _permission_code IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.companies c
    JOIN auth.users u ON lower(u.email)=lower(c.owner_email)
    WHERE c.id=_company_id AND u.id=v_user_id
  ) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.permissions p
      WHERE p.code=_permission_code AND p.is_active=true
    );
  END IF;

  SELECT e.id,e.role INTO v_employee_id,v_role
  FROM public.employees e
  WHERE e.user_id=v_user_id AND e.company_id=_company_id AND e.is_active=true
  ORDER BY CASE WHEN e.role='owner' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_employee_id IS NULL THEN RETURN false; END IF;

  IF v_role::text IN ('owner','admin') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.permissions p
      WHERE p.code=_permission_code AND p.is_active=true
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.employee_permissions ep
    JOIN public.permissions p ON p.id=ep.permission_id
    WHERE ep.employee_id=v_employee_id
      AND p.code=_permission_code
      AND p.is_active=true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.current_employee_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_company_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_company_permission(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_employee_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_company_permission(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_employee_permissions(
  p_target_employee_id uuid, p_permission_ids uuid[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user_id uuid:=auth.uid();
  v_company_id uuid;
  v_actor_employee_id uuid;
  v_actor_role text;
  v_target_company_id uuid;
  v_has_permission boolean:=false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT e.id,e.company_id,e.role INTO v_actor_employee_id,v_company_id,v_actor_role
  FROM public.employees e
  WHERE e.user_id=v_user_id AND e.is_active=true
  ORDER BY CASE WHEN e.role='owner' THEN 0 ELSE 1 END LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id FROM public.companies c
    WHERE lower(c.owner_email)=lower((SELECT email FROM auth.users WHERE id=v_user_id))
    LIMIT 1;
  END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Company context not found'; END IF;

  SELECT e.company_id INTO v_target_company_id FROM public.employees e WHERE e.id=p_target_employee_id;
  IF v_target_company_id IS NULL OR v_target_company_id<>v_company_id THEN
    RAISE EXCEPTION 'Employee does not belong to the current company';
  END IF;
  IF v_actor_employee_id=p_target_employee_id THEN
    RAISE EXCEPTION 'Employees cannot change their own permissions';
  END IF;

  IF v_actor_role::text IN ('owner','admin') THEN
    v_has_permission:=true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      JOIN public.permissions p ON p.id=ep.permission_id
      WHERE ep.employee_id=v_actor_employee_id
        AND p.code='employees.manage_permissions' AND p.is_active=true
    ) INTO v_has_permission;
  END IF;
  IF NOT v_has_permission THEN RAISE EXCEPTION 'Permission denied: employees.manage_permissions'; END IF;

  ALTER TABLE public.employee_permissions DISABLE TRIGGER trg_guard_employee_permission_change;
  DELETE FROM public.employee_permissions WHERE employee_id=p_target_employee_id;
  INSERT INTO public.employee_permissions(employee_id,permission_id)
  SELECT p_target_employee_id,p.id
  FROM public.permissions p
  WHERE p.id=ANY(COALESCE(p_permission_ids,ARRAY[]::uuid[]))
    AND p.is_active=true;
  ALTER TABLE public.employee_permissions ENABLE TRIGGER trg_guard_employee_permission_change;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employee_permissions(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employee_permissions(uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_employee_permission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user_id uuid:=auth.uid();
  v_actor_employee_id uuid;
  v_actor_company_id uuid;
  v_actor_role text;
  v_target_employee_id uuid;
  v_target_company_id uuid;
  v_allowed boolean:=false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_target_employee_id:=COALESCE(NEW.employee_id,OLD.employee_id);

  SELECT e.id,e.company_id,e.role INTO v_actor_employee_id,v_actor_company_id,v_actor_role
  FROM public.employees e
  WHERE e.user_id=v_user_id AND e.is_active=true
  ORDER BY CASE WHEN e.role='owner' THEN 0 ELSE 1 END LIMIT 1;

  SELECT e.company_id INTO v_target_company_id FROM public.employees e WHERE e.id=v_target_employee_id;
  IF v_target_company_id IS NULL OR v_actor_company_id IS NULL OR v_target_company_id<>v_actor_company_id
    THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF v_actor_employee_id=v_target_employee_id
    THEN RAISE EXCEPTION 'Employees cannot change their own permissions'; END IF;

  IF v_actor_role IN ('owner','admin') THEN
    v_allowed:=true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      JOIN public.permissions p ON p.id=ep.permission_id
      WHERE ep.employee_id=v_actor_employee_id
        AND p.code='employees.manage_permissions' AND p.is_active=true
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Permission denied: employees.manage_permissions'; END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_permission_change ON public.employee_permissions;
CREATE TRIGGER trg_guard_employee_permission_change
BEFORE INSERT OR UPDATE OR DELETE ON public.employee_permissions
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_permission_change();

-- A permissão antiga de serviços deixa de fazer parte do catálogo ativo.
UPDATE public.permissions SET is_active=false
WHERE code='services.view_services';

-- RLS principais da V2.
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
USING (public.user_has_company_permission(company_id,'employees.view'));
DROP POLICY IF EXISTS employees_insert ON public.employees;
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(company_id,'employees.create'));
DROP POLICY IF EXISTS employees_update ON public.employees;
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated
USING (public.user_has_company_permission(company_id,'employees.edit'))
WITH CHECK (public.user_has_company_permission(company_id,'employees.edit'));
DROP POLICY IF EXISTS employees_delete ON public.employees;
CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated
USING (public.user_has_company_permission(company_id,'employees.delete'));

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
USING (public.user_has_company_permission(company_id,'clients.view') OR auth.uid()=user_id);
DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(company_id,'clients.create'));
DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated
USING (public.user_has_company_permission(company_id,'clients.edit') OR auth.uid()=user_id)
WITH CHECK (public.user_has_company_permission(company_id,'clients.edit') OR auth.uid()=user_id);
DROP POLICY IF EXISTS clients_delete ON public.clients;
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated
USING (public.user_has_company_permission(company_id,'clients.delete'));

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id,'bookings.view')
  OR public.user_has_company_permission(company_id,'bookings.manage_all')
  OR (public.user_has_company_permission(company_id,'bookings.manage_own')
      AND employee_id=public.current_employee_id(company_id))
  OR EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id=client_id AND c.user_id=auth.uid() AND c.company_id=company_id
  )
);
DROP POLICY IF EXISTS bookings_insert ON public.bookings;
CREATE POLICY bookings_insert ON public.bookings FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_company_permission(company_id,'bookings.create')
  OR public.user_has_company_permission(company_id,'bookings.manage_all')
  OR (public.user_has_company_permission(company_id,'bookings.manage_own')
      AND employee_id=public.current_employee_id(company_id))
);
DROP POLICY IF EXISTS bookings_update ON public.bookings;
CREATE POLICY bookings_update ON public.bookings FOR UPDATE TO authenticated
USING (
  public.user_has_company_permission(company_id,'bookings.edit')
  OR public.user_has_company_permission(company_id,'bookings.cancel')
  OR public.user_has_company_permission(company_id,'bookings.manage_all')
  OR (public.user_has_company_permission(company_id,'bookings.manage_own')
      AND employee_id=public.current_employee_id(company_id))
  OR EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id=client_id AND c.user_id=auth.uid() AND c.company_id=company_id
  )
)
WITH CHECK (
  public.user_has_company_permission(company_id,'bookings.edit')
  OR public.user_has_company_permission(company_id,'bookings.cancel')
  OR public.user_has_company_permission(company_id,'bookings.manage_all')
  OR (public.user_has_company_permission(company_id,'bookings.manage_own')
      AND employee_id=public.current_employee_id(company_id))
);
DROP POLICY IF EXISTS bookings_delete ON public.bookings;
CREATE POLICY bookings_delete ON public.bookings FOR DELETE TO authenticated
USING (public.user_has_company_permission(company_id,'bookings.cancel')
  OR public.user_has_company_permission(company_id,'bookings.manage_all'));

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS services_select ON public.services;
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated
USING (public.user_has_company_permission(company_id,'services.view'));
DROP POLICY IF EXISTS services_public_select ON public.services;
CREATE POLICY services_public_select ON public.services FOR SELECT TO anon
USING (is_active=true);
DROP POLICY IF EXISTS services_insert ON public.services;
CREATE POLICY services_insert ON public.services FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(company_id,'services.create'));
DROP POLICY IF EXISTS services_update ON public.services;
CREATE POLICY services_update ON public.services FOR UPDATE TO authenticated
USING (public.user_has_company_permission(company_id,'services.edit'))
WITH CHECK (public.user_has_company_permission(company_id,'services.edit'));
DROP POLICY IF EXISTS services_delete ON public.services;
CREATE POLICY services_delete ON public.services FOR DELETE TO authenticated
USING (public.user_has_company_permission(company_id,'services.delete'));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.employees TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.clients TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bookings TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.services TO authenticated;

NOTIFY pgrst,'reload schema';

-- Restaura os helpers de autorização granular esperados pelo V2.
-- As migrations 2164+ estão registradas como aplicadas no remoto,
-- mas as funções não existem fisicamente na produção.

CREATE OR REPLACE FUNCTION public.current_employee_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.company_id = _company_id
    AND e.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.company_id = _company_id
      AND e.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_company_permission(
  _company_id uuid,
  _permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN auth.users u
        ON lower(u.email) = lower(c.owner_email)
      WHERE c.id = _company_id
        AND u.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.company_id = _company_id
        AND e.user_id = auth.uid()
        AND e.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.employee_permissions ep
      JOIN public.permissions p
        ON p.id = ep.permission_id
      JOIN public.employees e
        ON e.id = ep.employee_id
      WHERE e.company_id = _company_id
        AND e.user_id = auth.uid()
        AND p.code = _permission_code
        AND p.is_active = true
    );
$$;

REVOKE ALL ON FUNCTION public.current_employee_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_company_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_company_permission(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_employee_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_company_permission(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

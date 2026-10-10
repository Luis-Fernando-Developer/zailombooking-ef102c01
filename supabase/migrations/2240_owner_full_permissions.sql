-- FASE 12.2 — proprietário com acesso integral ao Booking
-- O papel owner representa o dono da empresa e não depende do catálogo
-- granular para autorizar operações próprias da empresa.

CREATE OR REPLACE FUNCTION public.user_has_company_permission(
  _company_id uuid, _permission_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_employee_id uuid;
  v_role text;
BEGIN
  IF v_user_id IS NULL OR _company_id IS NULL OR _permission_code IS NULL THEN
    RETURN false;
  END IF;

  -- Proprietário da empresa: acesso integral, independentemente do
  -- catálogo de permissões ativo.
  IF EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = v_user_id
      AND e.company_id = _company_id
      AND e.is_active = true
      AND e.role::text = 'owner'
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN auth.users u ON lower(u.email) = lower(c.owner_email)
    WHERE c.id = _company_id
      AND u.id = v_user_id
  ) THEN
    RETURN true;
  END IF;

  SELECT e.id, e.role
  INTO v_employee_id, v_role
  FROM public.employees e
  WHERE e.user_id = v_user_id
    AND e.company_id = _company_id
    AND e.is_active = true
  ORDER BY CASE WHEN e.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role::text = 'admin' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.permissions p
      WHERE p.code = _permission_code
        AND p.is_active = true
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.employee_permissions ep
    JOIN public.permissions p ON p.id = ep.permission_id
    WHERE ep.employee_id = v_employee_id
      AND p.code = _permission_code
      AND p.is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_company_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_company_permission(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- FASE 10.1: base de autorização para RLS.
--
-- Estas funções são a ponte entre employee_permissions e as políticas RLS.
-- Não alteram nenhuma tabela nem nenhuma policy nesta etapa.
-- A fonte de verdade continua sendo employee_permissions.
-- Owner/admin possuem acesso ao catálogo ativo da empresa.
-- Funcionários comuns precisam da permissão explícita.

CREATE OR REPLACE FUNCTION public.current_employee_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.company_id = _company_id
    AND e.is_active = true
  ORDER BY CASE WHEN e.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_member boolean := false;
BEGIN
  IF v_user_id IS NULL OR _company_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = v_user_id
      AND e.company_id = _company_id
      AND e.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN auth.users u
      ON lower(u.email) = lower(c.owner_email)
    WHERE c.id = _company_id
      AND u.id = v_user_id
  )
  INTO v_is_member;

  RETURN COALESCE(v_is_member, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_company_permission(
  _company_id uuid,
  _permission_code text
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
  v_allowed boolean := false;
BEGIN
  IF v_user_id IS NULL OR _company_id IS NULL OR _permission_code IS NULL THEN
    RETURN false;
  END IF;

  -- Owner identificado pelo vínculo da empresa.
  IF EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN auth.users u
      ON lower(u.email) = lower(c.owner_email)
    WHERE c.id = _company_id
      AND u.id = v_user_id
  ) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.permissions p
      WHERE p.code = _permission_code
        AND p.is_active = true
    );
  END IF;

  -- Vínculo ativo do funcionário na empresa.
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

  -- Owner/admin continuam com acesso integral ao catálogo ativo.
  IF v_role IN ('owner', 'admin') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.permissions p
      WHERE p.code = _permission_code
        AND p.is_active = true
    );
  END IF;

  -- Demais funcionários precisam da autorização individual.
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_permissions ep
    JOIN public.permissions p
      ON p.id = ep.permission_id
    WHERE ep.employee_id = v_employee_id
      AND p.code = _permission_code
      AND p.is_active = true
  )
  INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.current_employee_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_company_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_company_permission(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_employee_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_company_permission(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

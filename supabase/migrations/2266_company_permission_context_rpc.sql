-- 2266: carregamento confiável de permissões do usuário no contexto da empresa.
-- Evita que RLS de employees/employee_permissions faça a sidebar ficar vazia.
CREATE OR REPLACE FUNCTION public.get_my_company_permissions(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_employee record;
  v_is_owner boolean := false;
  v_codes text[] := ARRAY[]::text[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sessão necessária.');
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT id, role, is_active INTO v_employee
  FROM public.employees
  WHERE company_id = p_company_id AND user_id = v_user_id
  ORDER BY CASE WHEN role::text='owner' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT EXISTS(
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND lower(trim(owner_email)) = v_email
  ) INTO v_is_owner;

  IF v_employee.id IS NULL AND NOT v_is_owner THEN
    RETURN json_build_object('success', false, 'error', 'Usuário não vinculado a esta empresa.');
  END IF;

  IF v_employee.id IS NOT NULL AND v_employee.is_active IS NOT TRUE AND NOT v_is_owner THEN
    RETURN json_build_object('success', false, 'error', 'Vínculo de colaborador inativo.');
  END IF;

  IF v_is_owner OR v_employee.role::text IN ('owner','admin') THEN
    SELECT COALESCE(array_agg(code), ARRAY[]::text[]) INTO v_codes
    FROM public.permissions WHERE is_active = true;
    RETURN json_build_object('success', true, 'role', CASE WHEN v_is_owner THEN 'owner' ELSE v_employee.role::text END,
      'employee_id', v_employee.id, 'permissions', v_codes);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT p.code), ARRAY[]::text[]) INTO v_codes
  FROM public.employee_permissions ep
  JOIN public.permissions p ON p.id = ep.permission_id AND p.is_active = true
  WHERE ep.employee_id = v_employee.id;

  RETURN json_build_object('success', true, 'role', v_employee.role::text,
    'employee_id', v_employee.id, 'permissions', v_codes);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_company_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_permissions(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

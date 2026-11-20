-- 2262: identidade global reutilizável e senha contextual para colaboradores.
-- A senha é armazenada somente em employees.password_hash; nunca altera auth.users.
CREATE OR REPLACE FUNCTION public.set_employee_company_password(
  p_employee_id UUID,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_employee RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sessão necessária.');
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 OR octet_length(p_password) > 72 THEN
    RETURN json_build_object('success', false, 'error', 'A senha deve ter entre 6 e 72 bytes.');
  END IF;

  SELECT id, company_id INTO v_employee
  FROM public.employees
  WHERE id = p_employee_id;
  IF NOT FOUND OR NOT public.user_has_company_permission(v_employee.company_id, 'employees.create') THEN
    RETURN json_build_object('success', false, 'error', 'Sem permissão para configurar o acesso deste colaborador.');
  END IF;

  UPDATE public.employees
  SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  WHERE id = p_employee_id AND role <> 'owner';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Vínculo de colaborador inválido.');
  END IF;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.set_employee_company_password(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_company_password(UUID, TEXT) TO authenticated, service_role;

-- O login continua contextual pelo slug. Proprietários mantêm a confirmação
-- própria já existente; demais funções usam sua credencial no vínculo da empresa.
CREATE OR REPLACE FUNCTION public.validate_owner_password(
  p_email TEXT,
  p_company_slug TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id UUID;
  v_employee RECORD;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE slug = p_company_slug
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Empresa não encontrada.');
  END IF;

  SELECT e.id, e.user_id, e.email, e.name, e.password_hash, e.role,
         e.is_active, c.status, occ.confirmed_at
  INTO v_employee
  FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  LEFT JOIN public.owner_company_confirmations occ
    ON occ.employee_id = e.id AND occ.company_id = e.company_id
  WHERE e.company_id = v_company_id
    AND lower(trim(e.email)) = lower(trim(p_email))
  ORDER BY CASE WHEN e.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users
    WHERE lower(trim(email)) = lower(trim(p_email)) LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      RETURN json_build_object('success', false, 'needs_link', true, 'user_id', v_user_id,
        'error', 'Este e-mail já possui identidade no Zailom, mas não está vinculado a esta empresa.');
    END IF;
    RETURN json_build_object('success', false, 'error', 'Cadastro empresarial não encontrado.');
  END IF;

  IF v_employee.role = 'owner' AND v_employee.confirmed_at IS NULL THEN
    RETURN json_build_object('success', false, 'needs_confirmation', true,
      'error', 'Confirme o vínculo desta empresa pelo e-mail enviado.');
  END IF;

  IF v_employee.role <> 'owner' AND v_employee.is_active IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Este acesso de colaborador está inativo.');
  END IF;

  IF v_employee.password_hash IS NULL
     OR v_employee.password_hash <> extensions.crypt(p_password, v_employee.password_hash) THEN
    RETURN json_build_object('success', false, 'error', 'E-mail ou senha incorretos para esta empresa.');
  END IF;

  RETURN json_build_object(
    'success', true,
    'user_id', v_employee.user_id,
    'email', v_employee.email,
    'name', v_employee.name,
    'company_id', v_company_id,
    'status', v_employee.status,
    'role', v_employee.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_owner_password(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_owner_password(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

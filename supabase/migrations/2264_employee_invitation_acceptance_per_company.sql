-- 2264: aceite de convite por vínculo empresarial, sem depender da confirmação global do Auth.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS invitation_accepted_at timestamptz;

COMMENT ON COLUMN public.employees.invitation_accepted_at IS
  'Momento em que o colaborador validou seu acesso contextual nesta empresa. Não representa confirmação global do e-mail.';

CREATE OR REPLACE FUNCTION public.get_employees_invite_status(_company_id uuid)
RETURNS TABLE (employee_id uuid, user_id uuid, invite_accepted boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS employee_id,
    e.user_id,
    (e.invitation_accepted_at IS NOT NULL) AS invite_accepted
  FROM public.employees e
  WHERE e.company_id = _company_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_employees_invite_status(uuid) TO authenticated;

-- Só marca como aceito depois que a senha contextual do colaborador foi validada
-- no contexto da empresa selecionada. A confirmação global do Auth não interfere.
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

  IF v_employee.role <> 'owner' THEN
    UPDATE public.employees
    SET invitation_accepted_at = COALESCE(invitation_accepted_at, now())
    WHERE id = v_employee.id;
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

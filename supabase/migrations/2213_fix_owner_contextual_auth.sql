-- 2213: correções pós-implantação da autenticação contextual do proprietário
-- A 2212 já foi aplicada; esta migration leva as correções ao banco remoto.
-- 1) Corrige o campo confirmado usado por validate_owner_password.
-- 2) A RPC de criação de credencial é interna e deve ser executável apenas pelo service_role.
CREATE OR REPLACE FUNCTION public.validate_owner_password(
  p_email TEXT,
  p_company_slug TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  SELECT
    e.id,
    e.user_id,
    e.email,
    e.name,
    e.password_hash,
    c.status,
    occ.confirmed_at AS confirmed_at
  INTO v_employee
  FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  LEFT JOIN public.owner_company_confirmations occ
    ON occ.employee_id = e.id
   AND occ.company_id = e.company_id
  WHERE e.company_id = v_company_id
    AND e.role = 'owner'
    AND lower(trim(e.email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(p_email))
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      RETURN json_build_object(
        'success', false,
        'needs_link', true,
        'user_id', v_user_id,
        'error', 'Este e-mail já possui uma identidade no Zailom, mas ainda não está vinculado a esta empresa.'
      );
    END IF;

    RETURN json_build_object('success', false, 'error', 'Cadastro empresarial não encontrado.');
  END IF;

  IF v_employee.confirmed_at IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'needs_confirmation', true,
      'error', 'Confirme o vínculo desta empresa pelo e-mail enviado.'
    );
  END IF;

  IF v_employee.password_hash IS NULL
     OR v_employee.password_hash <> crypt(p_password, v_employee.password_hash) THEN
    RETURN json_build_object('success', false, 'error', 'E-mail ou senha incorretos para esta empresa.');
  END IF;

  RETURN json_build_object(
    'success', true,
    'user_id', v_employee.user_id,
    'email', v_employee.email,
    'name', v_employee.name,
    'company_id', v_company_id,
    'status', v_employee.status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_owner_company_credential(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_owner_company_credential(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

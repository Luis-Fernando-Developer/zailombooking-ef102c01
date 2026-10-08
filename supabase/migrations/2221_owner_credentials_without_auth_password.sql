-- 2221: replica o padrão multiempresa dos clientes para credenciais do proprietário.
-- A identidade global no Auth guarda somente o perfil. A senha empresarial nasce
-- apenas depois do pagamento, diretamente em employees.password_hash.
CREATE OR REPLACE FUNCTION public.create_owner_company_credential(
  p_user_id UUID,
  p_company_id UUID,
  p_email TEXT,
  p_password TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_token UUID;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL OR NULLIF(trim(p_email), '') IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Dados do vínculo empresarial inválidos.');
  END IF;

  -- Não recebe nem cria senha temporária. O hash permanece NULL até a etapa pós-pagamento.
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE company_id = p_company_id AND user_id = p_user_id AND role = 'owner'
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO public.employees (
      company_id, user_id, name, email, phone, role, employee_type, is_active, password_hash
    )
    VALUES (
      p_company_id, p_user_id, COALESCE(NULLIF(trim(p_name), ''), trim(p_email)),
      lower(trim(p_email)), p_phone, 'owner', 'owner', false, NULL
    )
    RETURNING id INTO v_employee_id;
  ELSE
    UPDATE public.employees
    SET password_hash = NULL,
        email = lower(trim(p_email)),
        name = COALESCE(NULLIF(trim(p_name), ''), name),
        phone = COALESCE(p_phone, phone),
        role = 'owner',
        is_active = false
    WHERE id = v_employee_id AND company_id = p_company_id;
  END IF;

  INSERT INTO public.owner_company_confirmations
    (user_id, company_id, employee_id, email, confirmed_at, password_setup_email_sent_at)
  VALUES
    (p_user_id, p_company_id, v_employee_id, lower(trim(p_email)), NULL, NULL)
  ON CONFLICT (user_id, company_id) DO UPDATE
    SET employee_id = EXCLUDED.employee_id,
        email = EXCLUDED.email,
        confirmation_token = gen_random_uuid(),
        confirmed_at = NULL,
        password_setup_email_sent_at = NULL
  RETURNING confirmation_token INTO v_token;

  RETURN json_build_object(
    'success', true,
    'employee_id', v_employee_id,
    'confirmation_token', v_token
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_owner_company_credential(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_owner_company_credential(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';

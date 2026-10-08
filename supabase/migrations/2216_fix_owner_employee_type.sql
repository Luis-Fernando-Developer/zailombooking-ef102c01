-- 2216: corrigir employee_type do proprietário
-- employee_type aceita os tipos operacionais "fixo"/"autonomo".
-- "owner" é uma função (role), não um tipo de colaborador.
-- Mantemos role = 'owner' e usamos employee_type = 'fixo'.

CREATE OR REPLACE FUNCTION public.create_owner_company_credential(
  p_user_id UUID,
  p_company_id UUID,
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_hash TEXT;
  v_token UUID;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL OR COALESCE(trim(p_password), '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Dados da credencial empresarial inválidos.');
  END IF;

  IF octet_length(p_password) > 72 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'A senha do proprietário deve ter no máximo 72 bytes.'
    );
  END IF;

  IF char_length(p_password) < 6 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'A senha do proprietário deve ter pelo menos 6 caracteres.'
    );
  END IF;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE company_id = p_company_id
    AND user_id = p_user_id
    AND role = 'owner'
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO public.employees (
      company_id, user_id, name, email, phone, role, employee_type, is_active
    )
    VALUES (
      p_company_id,
      p_user_id,
      p_name,
      lower(trim(p_email)),
      p_phone,
      'owner',
      'fixo',
      true
    )
    RETURNING id INTO v_employee_id;
  END IF;

  UPDATE public.employees
  SET password_hash = v_hash,
      email = lower(trim(p_email)),
      name = COALESCE(NULLIF(trim(p_name), ''), name),
      phone = COALESCE(p_phone, phone),
      role = 'owner',
      employee_type = 'fixo',
      is_active = true
  WHERE id = v_employee_id;

  INSERT INTO public.owner_company_confirmations (
    user_id, company_id, employee_id, email, confirmed_at
  )
  VALUES (
    p_user_id,
    p_company_id,
    v_employee_id,
    lower(trim(p_email)),
    NULL
  )
  ON CONFLICT (user_id, company_id) DO UPDATE
    SET employee_id = EXCLUDED.employee_id,
        email = EXCLUDED.email,
        confirmation_token = gen_random_uuid(),
        confirmed_at = NULL
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

GRANT EXECUTE ON FUNCTION public.create_owner_company_credential(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';

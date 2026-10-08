-- 2212: credencial empresarial por empresa para proprietários
-- A identidade global continua em auth.users; a senha de acesso ao painel é contextual à empresa.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS public.owner_company_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  confirmation_token UUID NOT NULL DEFAULT gen_random_uuid(),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id),
  UNIQUE(confirmation_token)
);

ALTER TABLE public.owner_company_confirmations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.owner_company_confirmations TO authenticated;
GRANT ALL ON public.owner_company_confirmations TO service_role;
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

  v_hash := crypt(p_password, gen_salt('bf'));

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE company_id = p_company_id AND user_id = p_user_id AND role = 'owner'
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO public.employees (company_id, user_id, name, email, phone, role, employee_type, is_active)
    VALUES (p_company_id, p_user_id, p_name, lower(trim(p_email)), p_phone, 'owner', 'owner', true)
    RETURNING id INTO v_employee_id;
  END IF;

  UPDATE public.employees
  SET password_hash = v_hash,
      email = lower(trim(p_email)),
      name = COALESCE(NULLIF(trim(p_name), ''), name),
      phone = COALESCE(p_phone, phone),
      role = 'owner',
      is_active = true
  WHERE id = v_employee_id;

  INSERT INTO public.owner_company_confirmations
    (user_id, company_id, employee_id, email, confirmed_at)
  VALUES
    (p_user_id, p_company_id, v_employee_id, lower(trim(p_email)), NULL)
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
  SELECT id INTO v_company_id FROM public.companies WHERE slug = p_company_slug LIMIT 1;
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Empresa não encontrada.');
  END IF;

  SELECT e.id, e.user_id, e.email, e.name, e.password_hash, c.status, occ.confirmed_at
  INTO v_employee
  FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  LEFT JOIN public.owner_company_confirmations occ
    ON occ.employee_id = e.id AND occ.company_id = e.company_id
  WHERE e.company_id = v_company_id
    AND e.role = 'owner'
    AND lower(trim(e.email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(trim(email)) = lower(trim(p_email)) LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      RETURN json_build_object('success', false, 'needs_link', true, 'user_id', v_user_id,
        'error', 'Este e-mail já possui uma identidade no Zailom, mas ainda não está vinculado a esta empresa.');
    END IF;
    RETURN json_build_object('success', false, 'error', 'Cadastro empresarial não encontrado.');
  END IF;

  IF v_employee.confirmed_at IS NULL THEN
    RETURN json_build_object('success', false, 'needs_confirmation', true,
      'error', 'Confirme o vínculo desta empresa pelo e-mail enviado.');
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

CREATE OR REPLACE FUNCTION public.confirm_owner_company_link(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
BEGIN
  SELECT * INTO v_record
  FROM public.owner_company_confirmations
  WHERE confirmation_token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Link de confirmação inválido.');
  END IF;

  UPDATE public.owner_company_confirmations
  SET confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = v_record.id;

  RETURN json_build_object(
    'success', true,
    'company_id', v_record.company_id,
    'employee_id', v_record.employee_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_owner_company_credential(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_owner_password(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_owner_company_link(UUID) TO anon, authenticated, service_role;

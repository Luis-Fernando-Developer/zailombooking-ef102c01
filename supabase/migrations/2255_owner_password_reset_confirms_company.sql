-- 2255: a redefinição da senha empresarial também conclui a confirmação do vínculo.
-- O link é enviado ao e-mail cadastrado; ao utilizá-lo, o proprietário comprova
-- acesso a esse endereço. A senha continua exclusivamente em employees.password_hash.
CREATE OR REPLACE FUNCTION public.reset_owner_company_password(
  p_token UUID,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_reset RECORD;
  v_employee_id UUID;
BEGIN
  IF p_token IS NULL
     OR COALESCE(char_length(p_password), 0) < 8
     OR octet_length(p_password) > 72 THEN
    RETURN json_build_object('success', false, 'error', 'O link ou a nova senha é inválido.');
  END IF;

  -- Bloqueia o token para impedir duas utilizações simultâneas.
  SELECT id, employee_id, company_id, email
    INTO v_reset
  FROM public.owner_company_password_resets
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Este link expirou ou já foi utilizado. Solicite uma nova recuperação.');
  END IF;

  -- Atualiza somente o proprietário pertencente à empresa e ao e-mail do token.
  UPDATE public.employees
     SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
         is_active = true
   WHERE id = v_reset.employee_id
     AND company_id = v_reset.company_id
     AND role = 'owner'
     AND lower(trim(email)) = lower(trim(v_reset.email))
  RETURNING id INTO v_employee_id;

  IF v_employee_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não foi possível localizar a credencial empresarial.');
  END IF;

  -- O uso do link enviado ao e-mail também confirma o vínculo desta empresa.
  -- Não altera a identidade global nem qualquer senha do Supabase Auth.
  UPDATE public.owner_company_confirmations
     SET confirmed_at = COALESCE(confirmed_at, now())
   WHERE employee_id = v_employee_id
     AND company_id = v_reset.company_id;

  -- Invalida o token utilizado e quaisquer outros links pendentes deste funcionário.
  UPDATE public.owner_company_password_resets
     SET used_at = now()
   WHERE employee_id = v_employee_id
     AND company_id = v_reset.company_id
     AND used_at IS NULL;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'Não foi possível redefinir a senha.');
END;
$$;

REVOKE ALL ON FUNCTION public.reset_owner_company_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_owner_company_password(UUID, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';

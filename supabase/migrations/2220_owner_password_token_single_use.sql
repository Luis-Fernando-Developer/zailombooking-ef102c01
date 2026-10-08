-- 2220: torna o link de criação de senha de uso único.
CREATE OR REPLACE FUNCTION public.set_owner_company_password(p_token UUID, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_paid BOOLEAN := false;
  v_waived BOOLEAN := false;
BEGIN
  IF p_token IS NULL OR COALESCE(length(p_password), 0) < 8 OR octet_length(p_password) > 72 THEN
    RETURN json_build_object('success', false, 'error', 'A senha deve ter entre 8 caracteres e 72 bytes.');
  END IF;
  SELECT occ.id, occ.user_id, occ.company_id, occ.employee_id, occ.email,
         c.name AS company_name, c.slug AS company_slug
    INTO v_link
  FROM public.owner_company_confirmations occ
  JOIN public.companies c ON c.id = occ.company_id
  WHERE occ.confirmation_token = p_token AND occ.confirmed_at IS NULL;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Link inválido.');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.company_invoices i
    WHERE i.company_id = v_link.company_id AND lower(i.status) = 'paid') INTO v_paid;
  SELECT EXISTS (
    SELECT 1 FROM public.company_subscriptions s
    JOIN public.company_invoices i ON i.company_id = s.company_id
    WHERE s.company_id = v_link.company_id
      AND COALESCE(s.discount_percentage, 0) >= 100
      AND COALESCE(i.amount, 0) = 0
      AND lower(i.status) IN ('cancelled', 'canceled', 'paid')
  ) INTO v_waived;
  IF NOT v_paid AND NOT v_waived THEN
    RETURN json_build_object('success', false, 'error', 'O pagamento ainda não foi confirmado.');
  END IF;
  UPDATE public.employees
    SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')), is_active = true
    WHERE id = v_link.employee_id AND company_id = v_link.company_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Vínculo empresarial não encontrado.');
  END IF;
  UPDATE public.owner_company_confirmations SET confirmed_at = COALESCE(confirmed_at, now()) WHERE id = v_link.id;
  UPDATE public.companies SET status = 'active' WHERE id = v_link.company_id;
  UPDATE public.company_subscriptions SET status = 'active', billing_status = 'active' WHERE company_id = v_link.company_id;
  RETURN json_build_object('success', true, 'company_id', v_link.company_id, 'company_name', v_link.company_name,
    'company_slug', v_link.company_slug, 'email', v_link.email, 'user_id', v_link.user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.set_owner_company_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_owner_company_password(UUID, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';

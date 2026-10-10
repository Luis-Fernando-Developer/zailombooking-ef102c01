-- 2221: recuperação segura da senha empresarial por empresa.
-- A senha empresarial é independente da senha global do Supabase Auth.
CREATE TABLE IF NOT EXISTS public.owner_company_password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_owner_company_password_resets_employee
  ON public.owner_company_password_resets (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_company_password_resets_token
  ON public.owner_company_password_resets (token)
  WHERE used_at IS NULL;

ALTER TABLE public.owner_company_password_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.owner_company_password_resets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.owner_company_password_resets TO service_role;

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
BEGIN
  IF p_token IS NULL
     OR COALESCE(char_length(p_password), 0) < 8
     OR octet_length(p_password) > 72 THEN
    RETURN json_build_object('success', false, 'error', 'O link ou a nova senha é inválido.');
  END IF;

  SELECT id, employee_id
    INTO v_reset
  FROM public.owner_company_password_resets
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Este link expirou ou já foi utilizado. Solicite uma nova recuperação.');
  END IF;

  UPDATE public.employees
     SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
   WHERE id = v_reset.employee_id
     AND role = 'owner';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Não foi possível localizar a credencial empresarial.');
  END IF;

  UPDATE public.owner_company_password_resets
     SET used_at = now()
   WHERE id = v_reset.id OR (employee_id = v_reset.employee_id AND used_at IS NULL);

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'Não foi possível redefinir a senha.');
END;
$$;

REVOKE ALL ON FUNCTION public.reset_owner_company_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_owner_company_password(UUID, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';

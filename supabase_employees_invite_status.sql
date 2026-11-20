-- Status de convite específico por empresa.
-- A confirmação global do e-mail em auth.users NÃO significa que o convite desta empresa foi aceito.
-- A migration 2264 cria employees.invitation_accepted_at e atualiza também o login contextual.
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

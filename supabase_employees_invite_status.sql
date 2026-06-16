-- Função para retornar o status do convite dos colaboradores (aceito/pendente)
-- Baseado em auth.users.email_confirmed_at
-- Rode este SQL no SQL Editor do Supabase.

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
    (u.email_confirmed_at IS NOT NULL) AS invite_accepted
  FROM public.employees e
  LEFT JOIN auth.users u ON u.id = e.user_id
  WHERE e.company_id = _company_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_employees_invite_status(uuid) TO authenticated;

-- 2265: colaboradores sempre podem ler o próprio vínculo empresarial.
-- O hook usePermissions precisa consultar role/id antes de carregar as permissões.
-- Sem esta policy, usuários sem employees.view não conseguiam ler nem o próprio
-- registro, causando menu vazio mesmo quando tinham outras permissões atribuídas.

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select_own_membership ON public.employees;
CREATE POLICY employees_select_own_membership
ON public.employees
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

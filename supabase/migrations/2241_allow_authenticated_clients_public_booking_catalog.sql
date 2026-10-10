-- 2205 — manter o catálogo público de agendamento disponível após login.
--
-- O fluxo /agendar é público, mas o cliente precisa autenticar antes de
-- concluir o agendamento. A 2201/2202 restringiu SELECT de services/employees
-- a permissões administrativas. Isso faz o catálogo desaparecer assim que
-- a sessão passa de anon para authenticated e impede a restauração do
-- agendamento pendente após o login.
--
-- Clientes autenticados podem somente ler o catálogo ativo da própria
-- empresa. Permissões administrativas continuam valendo para os demais
-- usuários.

BEGIN;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_booking_client_select ON public.services;
CREATE POLICY services_booking_client_select
ON public.services
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.user_is_company_client(auth.uid(), company_id)
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_booking_client_select ON public.employees;
CREATE POLICY employees_booking_client_select
ON public.employees
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.user_is_company_client(auth.uid(), company_id)
);

GRANT SELECT ON public.services TO authenticated;
GRANT SELECT ON public.employees TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

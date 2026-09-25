-- FASE 10.4: RLS da tabela bookings.
--
-- Funcionários da empresa são autorizados pelo catálogo de permissões.
-- bookings.view / bookings.manage_all permitem acesso amplo à empresa.
-- bookings.manage_own limita a leitura/alteração aos próprios agendamentos.
-- O cliente final mantém acesso somente aos próprios agendamentos.
-- A criação de clientes/agendamentos públicos continua fora desta policy
-- quando realizada por RPC/Edge Function com contexto apropriado.

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SELECT
-- ============================================================

DROP POLICY IF EXISTS bookings_select ON public.bookings;

CREATE POLICY bookings_select
ON public.bookings
FOR SELECT
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'bookings.view')
  OR public.user_has_company_permission(company_id, 'bookings.manage_all')
  OR (
    public.user_has_company_permission(company_id, 'bookings.manage_own')
    AND employee_id = public.current_employee_id(company_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_id
      AND c.user_id = auth.uid()
      AND c.company_id = company_id
  )
);

-- ============================================================
-- INSERT
-- ============================================================

DROP POLICY IF EXISTS bookings_insert ON public.bookings;

CREATE POLICY bookings_insert
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_company_permission(company_id, 'bookings.create')
  OR public.user_has_company_permission(company_id, 'bookings.manage_all')
  OR (
    public.user_has_company_permission(company_id, 'bookings.manage_own')
    AND employee_id = public.current_employee_id(company_id)
  )
);

-- ============================================================
-- UPDATE
-- ============================================================

DROP POLICY IF EXISTS bookings_update ON public.bookings;

CREATE POLICY bookings_update
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'bookings.edit')
  OR public.user_has_company_permission(company_id, 'bookings.cancel')
  OR public.user_has_company_permission(company_id, 'bookings.manage_all')
  OR (
    public.user_has_company_permission(company_id, 'bookings.manage_own')
    AND employee_id = public.current_employee_id(company_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_id
      AND c.user_id = auth.uid()
      AND c.company_id = company_id
  )
)
WITH CHECK (
  public.user_has_company_permission(company_id, 'bookings.edit')
  OR public.user_has_company_permission(company_id, 'bookings.cancel')
  OR public.user_has_company_permission(company_id, 'bookings.manage_all')
  OR (
    public.user_has_company_permission(company_id, 'bookings.manage_own')
    AND employee_id = public.current_employee_id(company_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_id
      AND c.user_id = auth.uid()
      AND c.company_id = company_id
  )
);

-- ============================================================
-- DELETE
-- ============================================================

DROP POLICY IF EXISTS bookings_delete ON public.bookings;

CREATE POLICY bookings_delete
ON public.bookings
FOR DELETE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'bookings.cancel')
  OR public.user_has_company_permission(company_id, 'bookings.manage_all')
);

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.bookings
TO authenticated;

NOTIFY pgrst, 'reload schema';

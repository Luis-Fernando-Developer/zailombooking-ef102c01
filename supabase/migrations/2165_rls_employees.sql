-- FASE 10.2: RLS da tabela employees.
--
-- A autorização utiliza as funções criadas na FASE 10.1.
-- Owner/admin possuem acesso integral.
-- Demais funcionários precisam da permissão explícita.
-- Nenhuma outra tabela é alterada nesta migration.

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SELECT
-- ============================================================

DROP POLICY IF EXISTS employees_select ON public.employees;

CREATE POLICY employees_select
ON public.employees
FOR SELECT
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'employees.view')
);

-- ============================================================
-- INSERT
-- ============================================================

DROP POLICY IF EXISTS employees_insert ON public.employees;

CREATE POLICY employees_insert
ON public.employees
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_company_permission(company_id, 'employees.create')
);

-- ============================================================
-- UPDATE
-- ============================================================

DROP POLICY IF EXISTS employees_update ON public.employees;

CREATE POLICY employees_update
ON public.employees
FOR UPDATE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'employees.edit')
)
WITH CHECK (
  public.user_has_company_permission(company_id, 'employees.edit')
);

-- ============================================================
-- DELETE
-- ============================================================

DROP POLICY IF EXISTS employees_delete ON public.employees;

CREATE POLICY employees_delete
ON public.employees
FOR DELETE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'employees.delete')
);

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.employees
TO authenticated;

NOTIFY pgrst, 'reload schema';

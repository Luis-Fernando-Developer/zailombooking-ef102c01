-- FASE 10.5: RLS da tabela services.
--
-- Funcionários autenticados usam o catálogo de permissões da empresa.
-- A área pública continua podendo consultar somente serviços ativos,
-- exclusivamente pelo papel anon.
-- Isso evita que a leitura pública de serviços vire bypass das
-- permissões de services para funcionários autenticados.

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- SELECT para funcionários autenticados
DROP POLICY IF EXISTS services_select ON public.services;
CREATE POLICY services_select
ON public.services
FOR SELECT
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'services.view')
);

-- SELECT público: catálogo ativo da empresa.
-- Restrito a anon para não conceder bypass aos funcionários autenticados.
DROP POLICY IF EXISTS services_public_select ON public.services;
CREATE POLICY services_public_select
ON public.services
FOR SELECT
TO anon
USING (
  is_active = true
);

-- INSERT
DROP POLICY IF EXISTS services_insert ON public.services;
CREATE POLICY services_insert
ON public.services
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_company_permission(company_id, 'services.create')
);

-- UPDATE
DROP POLICY IF EXISTS services_update ON public.services;
CREATE POLICY services_update
ON public.services
FOR UPDATE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'services.edit')
)
WITH CHECK (
  public.user_has_company_permission(company_id, 'services.edit')
);

-- DELETE
DROP POLICY IF EXISTS services_delete ON public.services;
CREATE POLICY services_delete
ON public.services
FOR DELETE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'services.delete')
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.services
TO authenticated;

GRANT SELECT
ON public.services
TO anon;

NOTIFY pgrst, 'reload schema';

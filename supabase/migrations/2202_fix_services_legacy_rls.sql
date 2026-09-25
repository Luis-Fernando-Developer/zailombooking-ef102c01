-- FASE 10.13 — correção definitiva das RLS da tabela services.
--
-- Remove policies legadas que concediam acesso amplo via role public.
-- Em PostgreSQL, policies PERMISSIVE são combinadas com OR; portanto,
-- uma policy antiga com qual = true anulava a restrição de services_update.
--
-- Mantém somente as policies granulares baseadas em
-- user_has_company_permission() para usuários autenticados.
-- O catálogo atual usa services.view (services.view_services foi removida
-- nas migrations 2169/2170).

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage services" ON public.services;
DROP POLICY IF EXISTS "Company members can manage services" ON public.services;
DROP POLICY IF EXISTS "Anyone can view services" ON public.services;
DROP POLICY IF EXISTS "Services are viewable by everyone" ON public.services;

DROP POLICY IF EXISTS services_select ON public.services;
CREATE POLICY services_select
ON public.services
FOR SELECT
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'services.view')
);

DROP POLICY IF EXISTS services_public_select ON public.services;
CREATE POLICY services_public_select
ON public.services
FOR SELECT
TO anon
USING (
  is_active = true
);

DROP POLICY IF EXISTS services_insert ON public.services;
CREATE POLICY services_insert
ON public.services
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_company_permission(company_id, 'services.create')
);

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

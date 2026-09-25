-- FASE 10.3: RLS da tabela clients.
--
-- Funcionários da empresa são autorizados pelo catálogo de permissões.
-- O cliente final mantém acesso somente ao próprio registro.
-- O isolamento entre empresas é preservado pelo company_id.
-- Criação/exclusão de clientes fica restrita às permissões da empresa.

CREATE OR REPLACE FUNCTION public.user_is_company_client(
  _user_id uuid,
  _company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.user_id = _user_id
      AND c.company_id = _company_id
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_company_client(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_company_client(uuid, uuid) TO authenticated;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SELECT
-- ============================================================

DROP POLICY IF EXISTS clients_select ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own profile" ON public.clients;

CREATE POLICY clients_select
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'clients.view')
  OR auth.uid() = user_id
);

-- ============================================================
-- INSERT
-- ============================================================

DROP POLICY IF EXISTS clients_insert ON public.clients;

CREATE POLICY clients_insert
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_company_permission(company_id, 'clients.create')
);

-- ============================================================
-- UPDATE
-- ============================================================

DROP POLICY IF EXISTS clients_update ON public.clients;

CREATE POLICY clients_update
ON public.clients
FOR UPDATE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'clients.edit')
  OR (
    auth.uid() = user_id
    AND public.user_is_company_client(auth.uid(), company_id)
  )
)
WITH CHECK (
  public.user_has_company_permission(company_id, 'clients.edit')
  OR (
    auth.uid() = user_id
    AND public.user_is_company_client(auth.uid(), company_id)
  )
);

-- ============================================================
-- DELETE
-- ============================================================

DROP POLICY IF EXISTS clients_delete ON public.clients;

CREATE POLICY clients_delete
ON public.clients
FOR DELETE
TO authenticated
USING (
  public.user_has_company_permission(company_id, 'clients.delete')
);

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.clients
TO authenticated;

NOTIFY pgrst, 'reload schema';

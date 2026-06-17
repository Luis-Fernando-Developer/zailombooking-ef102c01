-- ============================================================================
-- Módulo "Solicitações" — motor genérico de aprovações (multi-tenant)
-- Rodar manualmente no Supabase externo. Idempotente onde possível.
-- ============================================================================

-- 1. ENUMs
DO $$ BEGIN
  CREATE TYPE request_status AS ENUM (
    'draft','pending','in_review','approved','partially_approved','rejected','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE request_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. requests (entidade principal — payload JSON genérico)
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,                  -- ex.: schedule_change, absence_request, ...
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  title TEXT NOT NULL,
  description TEXT,
  status request_status NOT NULL DEFAULT 'pending',
  priority request_priority NOT NULL DEFAULT 'normal',
  due_date TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  assigned_to UUID[] DEFAULT '{}',             -- aprovadores designados (user ids)
  approved_by UUID REFERENCES auth.users(id),
  rejected_by UUID REFERENCES auth.users(id),
  revision_requested_by UUID REFERENCES auth.users(id),
  approval_flow JSONB NOT NULL DEFAULT '{}'::jsonb,   -- estado de aprovação parcial / múltiplos aprovadores
  audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_requests_tenant_status ON public.requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_type ON public.requests(request_type);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON public.requests(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;

-- 3. request_comments (chat/auditoria por solicitação)
CREATE TABLE IF NOT EXISTS public.request_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  author_role TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_request_comments_request ON public.request_comments(request_id, created_at);

GRANT SELECT, INSERT ON public.request_comments TO authenticated;
GRANT ALL ON public.request_comments TO service_role;

-- 4. request_audit_log (rastreabilidade completa)
CREATE TABLE IF NOT EXISTS public.request_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_role TEXT,
  action TEXT NOT NULL,                        -- created, approved, rejected, revision_requested, ...
  old_values JSONB,
  new_values JSONB,
  ip TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_request_audit_request ON public.request_audit_log(request_id, created_at);

GRANT SELECT, INSERT ON public.request_audit_log TO authenticated;
GRANT ALL ON public.request_audit_log TO service_role;

-- 5. request_approval_rules (configuração por tenant + request_type)
CREATE TABLE IF NOT EXISTS public.request_approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approver_roles TEXT[] NOT NULL DEFAULT '{owner,manager}',
  allow_partial BOOLEAN NOT NULL DEFAULT FALSE,
  multi_approver BOOLEAN NOT NULL DEFAULT FALSE,
  approval_order JSONB,                        -- ex.: ["manager","owner"]
  max_response_hours INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, request_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_approval_rules TO authenticated;
GRANT ALL ON public.request_approval_rules TO service_role;

-- 6. trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_requests_updated_at ON public.requests;
CREATE TRIGGER trg_requests_updated_at BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_approval_rules_updated_at ON public.request_approval_rules;
CREATE TRIGGER trg_approval_rules_updated_at BEFORE UPDATE ON public.request_approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Helper: usuário pertence ao tenant?
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees WHERE user_id = _user_id AND company_id = _company_id
  ) OR EXISTS (
    SELECT 1 FROM public.companies c
    JOIN auth.users u ON LOWER(u.email) = LOWER(c.owner_email)
    WHERE c.id = _company_id AND u.id = _user_id
  );
$$;

-- 8. RLS
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_tenant_read"   ON public.requests;
DROP POLICY IF EXISTS "requests_tenant_insert" ON public.requests;
DROP POLICY IF EXISTS "requests_tenant_update" ON public.requests;

CREATE POLICY "requests_tenant_read" ON public.requests
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id));

CREATE POLICY "requests_tenant_insert" ON public.requests
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

CREATE POLICY "requests_tenant_update" ON public.requests
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "comments_tenant_read"   ON public.request_comments;
DROP POLICY IF EXISTS "comments_tenant_insert" ON public.request_comments;

CREATE POLICY "comments_tenant_read" ON public.request_comments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_id AND public.user_belongs_to_company(auth.uid(), r.tenant_id)
  ));

CREATE POLICY "comments_tenant_insert" ON public.request_comments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_id AND public.user_belongs_to_company(auth.uid(), r.tenant_id)
  ));

DROP POLICY IF EXISTS "audit_tenant_read" ON public.request_audit_log;
CREATE POLICY "audit_tenant_read" ON public.request_audit_log
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "rules_tenant_read"   ON public.request_approval_rules;
DROP POLICY IF EXISTS "rules_tenant_write"  ON public.request_approval_rules;
CREATE POLICY "rules_tenant_read" ON public.request_approval_rules
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id));
CREATE POLICY "rules_tenant_write" ON public.request_approval_rules
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), tenant_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), tenant_id));

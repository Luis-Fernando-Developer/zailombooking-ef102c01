-- =========================================================================
-- MARKETING MODULE — Schema completo
-- Execute manualmente no Supabase externo (SQL Editor).
-- Pré-requisito: tabelas public.companies e public.employees já existem.
-- =========================================================================

-- Tipos
DO $$ BEGIN
  CREATE TYPE public.marketing_material_type AS ENUM ('banner','imagem','video','gif','documento','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.marketing_status AS ENUM ('draft','pending_approval','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM ('draft','pending_approval','approved','scheduled','active','ended','cancelled','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.approval_decision AS ENUM ('approved','rejected','revision_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- 1. Materiais
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.marketing_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  material_type public.marketing_material_type NOT NULL DEFAULT 'imagem',
  file_url TEXT,
  file_path TEXT,
  file_mime TEXT,
  file_size BIGINT,
  status public.marketing_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  approver_targets UUID[] DEFAULT '{}',  -- employees.id ou auth.users.id selecionados como aprovadores
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mkt_materials_company ON public.marketing_materials(company_id);
CREATE INDEX IF NOT EXISTS idx_mkt_materials_status ON public.marketing_materials(company_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_materials_type ON public.marketing_materials(company_id, material_type);

-- =========================================================================
-- 2. Campanhas
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  -- publicação
  placements TEXT[] DEFAULT '{}', -- 'hero','hero_carousel','top_bar','popup','client_area','employee_area','notifications'
  -- público
  audience_type TEXT NOT NULL DEFAULT 'all', -- all, all_employees, clients, employees, segmented
  audience_filters JSONB DEFAULT '{}'::jsonb, -- {role,service,unit,status,...}
  -- aprovação
  approver_targets UUID[] DEFAULT '{}',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  cancelled_reason TEXT,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mkt_camp_company ON public.marketing_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_mkt_camp_status ON public.marketing_campaigns(company_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_camp_window ON public.marketing_campaigns(start_at, end_at);

-- =========================================================================
-- 3. Vínculo campanha <-> materiais (N:N)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.marketing_campaign_materials (
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.marketing_materials(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT '', -- ex: 'banner_principal','banner_mobile','popup','video'
  ordering INT DEFAULT 0,
  PRIMARY KEY (campaign_id, material_id, role)
);
CREATE INDEX IF NOT EXISTS idx_mkt_cm_material ON public.marketing_campaign_materials(material_id);

-- =========================================================================
-- 4. Aprovações (materiais e campanhas)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.marketing_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('material','campaign')),
  target_id UUID NOT NULL,
  decision public.approval_decision NOT NULL,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by_role TEXT,
  observation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_appr_target ON public.marketing_approvals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_mkt_appr_company ON public.marketing_approvals(company_id, created_at DESC);

-- =========================================================================
-- 5. Histórico/auditoria
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.marketing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- material, campaign, approval, publication, notification
  entity_id UUID,
  event TEXT NOT NULL,       -- created, updated, submitted, approved, rejected, published, ended, cancelled, revision_requested
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_hist_company ON public.marketing_history(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_hist_entity ON public.marketing_history(entity_type, entity_id);

-- =========================================================================
-- GRANTS (Data API)
-- =========================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_approvals TO authenticated;
GRANT SELECT, INSERT ON public.marketing_history TO authenticated;
GRANT ALL ON public.marketing_materials, public.marketing_campaigns, public.marketing_campaign_materials, public.marketing_approvals, public.marketing_history TO service_role;
-- Leitura pública apenas das campanhas ativas para exibir na landing (filtrado por policy abaixo)
GRANT SELECT ON public.marketing_campaigns TO anon;
GRANT SELECT ON public.marketing_campaign_materials TO anon;
GRANT SELECT ON public.marketing_materials TO anon;

-- =========================================================================
-- Helper: papel do usuário em uma empresa (SECURITY DEFINER, evita recursão)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mkt_user_role_in_company(_user_id UUID, _company_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = _company_id
        AND lower(c.owner_email) = lower((SELECT email FROM auth.users WHERE id = _user_id))
    ) THEN 'owner'
    ELSE COALESCE(
      (SELECT role::text FROM public.employees
        WHERE company_id = _company_id AND user_id = _user_id
        LIMIT 1),
      'guest'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.mkt_can_edit(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mkt_user_role_in_company(_user_id, _company_id)
    IN ('owner','manager','rh','marketing','designer');
$$;

CREATE OR REPLACE FUNCTION public.mkt_can_approve(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mkt_user_role_in_company(_user_id, _company_id)
    IN ('owner','manager','rh');
$$;

CREATE OR REPLACE FUNCTION public.mkt_can_view(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mkt_user_role_in_company(_user_id, _company_id) <> 'guest';
$$;

-- =========================================================================
-- RLS
-- =========================================================================
ALTER TABLE public.marketing_materials            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_materials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_approvals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_history              ENABLE ROW LEVEL SECURITY;

-- materiais
DROP POLICY IF EXISTS mkt_mat_view ON public.marketing_materials;
CREATE POLICY mkt_mat_view ON public.marketing_materials FOR SELECT TO authenticated
  USING (public.mkt_can_view(auth.uid(), company_id));
DROP POLICY IF EXISTS mkt_mat_write ON public.marketing_materials;
CREATE POLICY mkt_mat_write ON public.marketing_materials FOR ALL TO authenticated
  USING (public.mkt_can_edit(auth.uid(), company_id))
  WITH CHECK (public.mkt_can_edit(auth.uid(), company_id));

-- campanhas
DROP POLICY IF EXISTS mkt_camp_view_auth ON public.marketing_campaigns;
CREATE POLICY mkt_camp_view_auth ON public.marketing_campaigns FOR SELECT TO authenticated
  USING (public.mkt_can_view(auth.uid(), company_id));
DROP POLICY IF EXISTS mkt_camp_view_anon ON public.marketing_campaigns;
CREATE POLICY mkt_camp_view_anon ON public.marketing_campaigns FOR SELECT TO anon
  USING (status IN ('approved','scheduled','active'));
DROP POLICY IF EXISTS mkt_camp_write ON public.marketing_campaigns;
CREATE POLICY mkt_camp_write ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.mkt_can_edit(auth.uid(), company_id))
  WITH CHECK (public.mkt_can_edit(auth.uid(), company_id));

-- vínculos
DROP POLICY IF EXISTS mkt_cm_view_auth ON public.marketing_campaign_materials;
CREATE POLICY mkt_cm_view_auth ON public.marketing_campaign_materials FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS mkt_cm_view_anon ON public.marketing_campaign_materials;
CREATE POLICY mkt_cm_view_anon ON public.marketing_campaign_materials FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS mkt_cm_write ON public.marketing_campaign_materials;
CREATE POLICY mkt_cm_write ON public.marketing_campaign_materials FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.marketing_campaigns c
                 WHERE c.id = campaign_id AND public.mkt_can_edit(auth.uid(), c.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.marketing_campaigns c
                 WHERE c.id = campaign_id AND public.mkt_can_edit(auth.uid(), c.company_id)));

-- aprovações
DROP POLICY IF EXISTS mkt_appr_view ON public.marketing_approvals;
CREATE POLICY mkt_appr_view ON public.marketing_approvals FOR SELECT TO authenticated
  USING (public.mkt_can_view(auth.uid(), company_id));
DROP POLICY IF EXISTS mkt_appr_insert ON public.marketing_approvals;
CREATE POLICY mkt_appr_insert ON public.marketing_approvals FOR INSERT TO authenticated
  WITH CHECK (public.mkt_can_approve(auth.uid(), company_id));

-- histórico
DROP POLICY IF EXISTS mkt_hist_view ON public.marketing_history;
CREATE POLICY mkt_hist_view ON public.marketing_history FOR SELECT TO authenticated
  USING (public.mkt_can_view(auth.uid(), company_id));
DROP POLICY IF EXISTS mkt_hist_insert ON public.marketing_history;
CREATE POLICY mkt_hist_insert ON public.marketing_history FOR INSERT TO authenticated
  WITH CHECK (public.mkt_can_view(auth.uid(), company_id));

-- =========================================================================
-- Triggers: updated_at + histórico automático
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mkt_touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_mkt_mat_touch ON public.marketing_materials;
CREATE TRIGGER trg_mkt_mat_touch BEFORE UPDATE ON public.marketing_materials
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mkt_camp_touch ON public.marketing_campaigns;
CREATE TRIGGER trg_mkt_camp_touch BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch_updated_at();

CREATE OR REPLACE FUNCTION public.mkt_log_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_event TEXT; v_entity TEXT;
BEGIN
  v_entity := TG_ARGV[0];
  IF TG_OP = 'INSERT' THEN v_event := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF v_entity = 'material' AND NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := 'status:' || NEW.status::text;
    ELSIF v_entity = 'campaign' AND NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := 'status:' || NEW.status::text;
    ELSE v_event := 'updated';
    END IF;
  ELSE v_event := 'deleted';
  END IF;

  INSERT INTO public.marketing_history(company_id, entity_type, entity_id, event, actor_id, payload)
  VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    v_entity,
    COALESCE(NEW.id, OLD.id),
    v_event,
    auth.uid(),
    jsonb_build_object('op', TG_OP)
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_mkt_mat_log ON public.marketing_materials;
CREATE TRIGGER trg_mkt_mat_log AFTER INSERT OR UPDATE ON public.marketing_materials
  FOR EACH ROW EXECUTE FUNCTION public.mkt_log_change('material');

DROP TRIGGER IF EXISTS trg_mkt_camp_log ON public.marketing_campaigns;
CREATE TRIGGER trg_mkt_camp_log AFTER INSERT OR UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.mkt_log_change('campaign');

-- =========================================================================
-- STORAGE — Bucket público para materiais
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-assets','marketing-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS mkt_storage_read ON storage.objects;
CREATE POLICY mkt_storage_read ON storage.objects FOR SELECT
  USING (bucket_id = 'marketing-assets');

DROP POLICY IF EXISTS mkt_storage_write ON storage.objects;
CREATE POLICY mkt_storage_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-assets');

DROP POLICY IF EXISTS mkt_storage_update ON storage.objects;
CREATE POLICY mkt_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'marketing-assets');

DROP POLICY IF EXISTS mkt_storage_delete ON storage.objects;
CREATE POLICY mkt_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-assets');

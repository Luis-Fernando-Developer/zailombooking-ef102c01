-- FASE 10.7 — RLS de Marketing.
-- Visualização granular; escrita/aprovação continuam separadas.

ALTER TABLE IF EXISTS public.marketing_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_campaign_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_mat_view ON public.marketing_materials;
DROP POLICY IF EXISTS mkt_mat_write ON public.marketing_materials;
DROP POLICY IF EXISTS marketing_materials_permission_select ON public.marketing_materials;
DROP POLICY IF EXISTS marketing_materials_permission_insert ON public.marketing_materials;
DROP POLICY IF EXISTS marketing_materials_permission_update ON public.marketing_materials;
DROP POLICY IF EXISTS marketing_materials_permission_delete ON public.marketing_materials;

CREATE POLICY marketing_materials_permission_select ON public.marketing_materials
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'marketing.view')
  OR public.user_has_company_permission(company_id, 'marketing.view_materials')
);

CREATE POLICY marketing_materials_permission_insert ON public.marketing_materials
FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(company_id, 'marketing.create'));

CREATE POLICY marketing_materials_permission_update ON public.marketing_materials
FOR UPDATE TO authenticated
USING (public.user_has_company_permission(company_id, 'marketing.edit'))
WITH CHECK (public.user_has_company_permission(company_id, 'marketing.edit'));

CREATE POLICY marketing_materials_permission_delete ON public.marketing_materials
FOR DELETE TO authenticated
USING (public.user_has_company_permission(company_id, 'marketing.delete'));

DROP POLICY IF EXISTS mkt_camp_view_auth ON public.marketing_campaigns;
DROP POLICY IF EXISTS mkt_camp_write ON public.marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_permission_select ON public.marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_permission_insert ON public.marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_permission_update ON public.marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_permission_delete ON public.marketing_campaigns;

CREATE POLICY marketing_campaigns_permission_select ON public.marketing_campaigns
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'marketing.view')
  OR public.user_has_company_permission(company_id, 'marketing.view_campaigns')
);

CREATE POLICY marketing_campaigns_permission_insert ON public.marketing_campaigns
FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(company_id, 'marketing.create'));

CREATE POLICY marketing_campaigns_permission_update ON public.marketing_campaigns
FOR UPDATE TO authenticated
USING (public.user_has_company_permission(company_id, 'marketing.edit'))
WITH CHECK (public.user_has_company_permission(company_id, 'marketing.edit'));

CREATE POLICY marketing_campaigns_permission_delete ON public.marketing_campaigns
FOR DELETE TO authenticated
USING (public.user_has_company_permission(company_id, 'marketing.delete'));

DROP POLICY IF EXISTS mkt_cm_view_auth ON public.marketing_campaign_materials;
DROP POLICY IF EXISTS mkt_cm_write ON public.marketing_campaign_materials;
DROP POLICY IF EXISTS marketing_campaign_materials_permission_select ON public.marketing_campaign_materials;
DROP POLICY IF EXISTS marketing_campaign_materials_permission_write ON public.marketing_campaign_materials;

CREATE POLICY marketing_campaign_materials_permission_select ON public.marketing_campaign_materials
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.marketing_campaigns c
    WHERE c.id = campaign_id
      AND (
        public.user_has_company_permission(c.company_id, 'marketing.view')
        OR public.user_has_company_permission(c.company_id, 'marketing.view_campaigns')
        OR public.user_has_company_permission(c.company_id, 'marketing.view_materials')
      )
  )
);

CREATE POLICY marketing_campaign_materials_permission_write ON public.marketing_campaign_materials
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.marketing_campaigns c
    WHERE c.id = campaign_id AND public.user_has_company_permission(c.company_id, 'marketing.edit'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.marketing_campaigns c
    WHERE c.id = campaign_id AND public.user_has_company_permission(c.company_id, 'marketing.edit'))
);

DROP POLICY IF EXISTS mkt_appr_view ON public.marketing_approvals;
DROP POLICY IF EXISTS mkt_appr_insert ON public.marketing_approvals;
DROP POLICY IF EXISTS marketing_approvals_permission_select ON public.marketing_approvals;
DROP POLICY IF EXISTS marketing_approvals_permission_insert ON public.marketing_approvals;

CREATE POLICY marketing_approvals_permission_select ON public.marketing_approvals
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'marketing.view')
  OR public.user_has_company_permission(company_id, 'marketing.view_approvals')
);

CREATE POLICY marketing_approvals_permission_insert ON public.marketing_approvals
FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(company_id, 'marketing.approve'));

DROP POLICY IF EXISTS mkt_hist_view ON public.marketing_history;
DROP POLICY IF EXISTS mkt_hist_insert ON public.marketing_history;
DROP POLICY IF EXISTS marketing_history_permission_select ON public.marketing_history;
DROP POLICY IF EXISTS marketing_history_permission_insert ON public.marketing_history;

CREATE POLICY marketing_history_permission_select ON public.marketing_history
FOR SELECT TO authenticated
USING (
  public.user_has_company_permission(company_id, 'marketing.view')
  OR public.user_has_company_permission(company_id, 'marketing.view_history')
);

CREATE POLICY marketing_history_permission_insert ON public.marketing_history
FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_company_permission(company_id, 'marketing.edit')
  OR public.user_has_company_permission(company_id, 'marketing.approve')
);

-- Preserve anonymous/public campaign rendering.
DROP POLICY IF EXISTS mkt_camp_view_anon ON public.marketing_campaigns;
CREATE POLICY mkt_camp_view_anon ON public.marketing_campaigns
FOR SELECT TO anon
USING (status IN ('approved','scheduled','active'));

DROP POLICY IF EXISTS mkt_cm_view_anon ON public.marketing_campaign_materials;
CREATE POLICY mkt_cm_view_anon ON public.marketing_campaign_materials
FOR SELECT TO anon USING (true);

NOTIFY pgrst, 'reload schema';

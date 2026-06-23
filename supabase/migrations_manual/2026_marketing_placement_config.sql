-- =========================================================================
-- MARKETING: placement_config + tracking de cliques
-- Execute no SQL Editor do Supabase externo.
-- =========================================================================

-- 1) Coluna de configuração por placement
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS placement_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.marketing_campaigns.placement_config IS
  'Config por placement: { "top_bar": {url,label,bg,fg,font,fontSize,btnBg,btnFg,countdown}, "popup":{...}, "hero":{url,label,buttonPosition}, "hero_carousel":{...}, "notifications":{url,label}, "client_area":{...}, "employee_area":{...}, "whatsapp":{url,label,message}, "sms":{url,label,message} }';

-- 2) Tracking de cliques
CREATE TABLE IF NOT EXISTS public.marketing_campaign_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  placement TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_session TEXT,
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkt_clicks_campaign ON public.marketing_campaign_clicks(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_clicks_company  ON public.marketing_campaign_clicks(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_clicks_placement ON public.marketing_campaign_clicks(campaign_id, placement);

GRANT SELECT, INSERT ON public.marketing_campaign_clicks TO authenticated;
GRANT INSERT ON public.marketing_campaign_clicks TO anon;
GRANT ALL ON public.marketing_campaign_clicks TO service_role;

ALTER TABLE public.marketing_campaign_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_clicks_insert_any ON public.marketing_campaign_clicks;
CREATE POLICY mkt_clicks_insert_any ON public.marketing_campaign_clicks
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketing_campaigns c
      WHERE c.id = campaign_id
        AND c.company_id = marketing_campaign_clicks.company_id
        AND c.status IN ('approved','scheduled','active')
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS mkt_clicks_view ON public.marketing_campaign_clicks;
CREATE POLICY mkt_clicks_view ON public.marketing_campaign_clicks
  FOR SELECT TO authenticated
  USING (public.mkt_can_view(auth.uid(), company_id));

-- 3) View agregada (CTR por campanha/placement)
CREATE OR REPLACE VIEW public.marketing_campaign_click_stats AS
SELECT
  campaign_id,
  company_id,
  placement,
  COUNT(*) AS clicks,
  COUNT(DISTINCT COALESCE(user_id::text, anon_session)) AS unique_clicks,
  MAX(created_at) AS last_click_at
FROM public.marketing_campaign_clicks
GROUP BY campaign_id, company_id, placement;

GRANT SELECT ON public.marketing_campaign_click_stats TO authenticated;

-- 4) Atualiza geração de notificações para incluir link da config
CREATE OR REPLACE FUNCTION public.mkt_generate_campaign_notifications(_campaign public.marketing_campaigns)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_link TEXT;
BEGIN
  IF _campaign.deleted_at IS NOT NULL THEN RETURN 0; END IF;
  IF _campaign.status NOT IN ('approved', 'scheduled', 'active') THEN RETURN 0; END IF;
  IF NOT COALESCE(_campaign.placements, ARRAY[]::TEXT[]) @> ARRAY['notifications']::TEXT[] THEN RETURN 0; END IF;
  IF _campaign.start_at IS NOT NULL AND _campaign.start_at > now() THEN RETURN 0; END IF;
  IF _campaign.end_at   IS NOT NULL AND _campaign.end_at   < now() THEN RETURN 0; END IF;

  v_link := NULLIF(COALESCE(_campaign.placement_config, '{}'::jsonb)->'notifications'->>'url', '');

  WITH recipients AS (
    SELECT c.user_id
    FROM public.clients c
    WHERE c.company_id = _campaign.company_id
      AND c.user_id IS NOT NULL
      AND _campaign.audience_type IN ('all', 'clients')
    UNION
    SELECT e.user_id
    FROM public.employees e
    WHERE e.company_id = _campaign.company_id
      AND e.user_id IS NOT NULL
      AND (
        _campaign.audience_type IN ('all', 'all_employees', 'employees')
        OR (
          _campaign.audience_type = 'segmented'
          AND (
            NOT (COALESCE(_campaign.audience_filters, '{}'::jsonb) ? 'role')
            OR e.role::text = COALESCE(_campaign.audience_filters, '{}'::jsonb)->>'role'
          )
        )
      )
    UNION
    SELECT u.id
    FROM public.companies co
    JOIN auth.users u ON lower(u.email) = lower(co.owner_email)
    WHERE co.id = _campaign.company_id
      AND _campaign.audience_type IN ('all', 'all_employees', 'employees')
  )
  INSERT INTO public.company_notifications (
    company_id, target_user_id, type, title, message, link, metadata
  )
  SELECT
    _campaign.company_id,
    r.user_id,
    'marketing',
    COALESCE(NULLIF(_campaign.name, ''), 'Nova campanha'),
    COALESCE(NULLIF(_campaign.description, ''), 'Confira a novidade disponível para você.'),
    v_link,
    jsonb_build_object(
      'campaign_id', _campaign.id,
      'campaign_name', _campaign.name,
      'cta_url', v_link,
      'cta_label', COALESCE(_campaign.placement_config->'notifications'->>'label', 'Saiba mais'),
      'source', 'marketing_campaign_trigger'
    )
  FROM recipients r
  WHERE r.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.company_notifications n
      WHERE n.company_id = _campaign.company_id
        AND n.target_user_id = r.user_id
        AND n.type = 'marketing'
        AND n.metadata->>'campaign_id' = _campaign.id::text
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 5) Recria o trigger incluindo placement_config no UPDATE OF
DROP TRIGGER IF EXISTS trg_mkt_campaign_notifications ON public.marketing_campaigns;
CREATE TRIGGER trg_mkt_campaign_notifications
  AFTER INSERT OR UPDATE OF status, placements, audience_type, audience_filters, start_at, end_at, name, description, deleted_at, placement_config
  ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.mkt_campaign_notifications_trigger();

NOTIFY pgrst, 'reload schema';

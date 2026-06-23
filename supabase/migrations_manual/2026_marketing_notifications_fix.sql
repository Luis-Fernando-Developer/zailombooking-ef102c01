-- =========================================================================
-- MARKETING NOTIFICATIONS FIX
-- Execute no SQL Editor do Supabase externo.
-- Corrige:
-- 1) Clientes finais passam a poder ler/atualizar notificações direcionadas.
-- 2) Campanhas com placement "notifications" geram notificações automaticamente.
-- 3) Backfill para campanhas já aprovadas/ativas dentro da janela de publicação.
-- =========================================================================

ALTER TABLE public.company_notifications
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_company_notif_target
  ON public.company_notifications(target_user_id, is_read, created_at DESC);

CREATE OR REPLACE FUNCTION public.user_is_company_client(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
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
      AND COALESCE(c.is_active, TRUE) = TRUE
  );
$$;

DROP POLICY IF EXISTS "company members read notifs" ON public.company_notifications;
CREATE POLICY "company members read notifs"
  ON public.company_notifications FOR SELECT
  TO authenticated
  USING (
    (
      target_user_id IS NULL
      AND public.user_belongs_to_company(auth.uid(), company_id)
    )
    OR
    (
      target_user_id = auth.uid()
      AND (
        public.user_belongs_to_company(auth.uid(), company_id)
        OR public.user_is_company_client(auth.uid(), company_id)
      )
    )
  );

DROP POLICY IF EXISTS "company members update notifs" ON public.company_notifications;
CREATE POLICY "company members update notifs"
  ON public.company_notifications FOR UPDATE
  TO authenticated
  USING (
    (
      target_user_id IS NULL
      AND public.user_belongs_to_company(auth.uid(), company_id)
    )
    OR
    (
      target_user_id = auth.uid()
      AND (
        public.user_belongs_to_company(auth.uid(), company_id)
        OR public.user_is_company_client(auth.uid(), company_id)
      )
    )
  )
  WITH CHECK (
    (
      target_user_id IS NULL
      AND public.user_belongs_to_company(auth.uid(), company_id)
    )
    OR
    (
      target_user_id = auth.uid()
      AND (
        public.user_belongs_to_company(auth.uid(), company_id)
        OR public.user_is_company_client(auth.uid(), company_id)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.mkt_generate_campaign_notifications(_campaign public.marketing_campaigns)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF _campaign.deleted_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF _campaign.status NOT IN ('approved', 'scheduled', 'active') THEN
    RETURN 0;
  END IF;

  IF NOT COALESCE(_campaign.placements, ARRAY[]::TEXT[]) @> ARRAY['notifications']::TEXT[] THEN
    RETURN 0;
  END IF;

  IF _campaign.start_at IS NOT NULL AND _campaign.start_at > now() THEN
    RETURN 0;
  END IF;

  IF _campaign.end_at IS NOT NULL AND _campaign.end_at < now() THEN
    RETURN 0;
  END IF;

  WITH recipients AS (
    SELECT c.user_id
    FROM public.clients c
    WHERE c.company_id = _campaign.company_id
      AND c.user_id IS NOT NULL
      AND COALESCE(c.is_active, TRUE) = TRUE
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
            NOT COALESCE(_campaign.audience_filters, '{}'::jsonb) ? 'role'
            OR e.role::text = COALESCE(_campaign.audience_filters, '{}'::jsonb)->>'role'
          )
        )
      )
  )
  INSERT INTO public.company_notifications (
    company_id,
    target_user_id,
    type,
    title,
    message,
    link,
    metadata
  )
  SELECT
    _campaign.company_id,
    r.user_id,
    'marketing',
    COALESCE(NULLIF(_campaign.name, ''), 'Nova campanha'),
    COALESCE(NULLIF(_campaign.description, ''), 'Confira a novidade disponível para você.'),
    NULL,
    jsonb_build_object(
      'campaign_id', _campaign.id,
      'campaign_name', _campaign.name,
      'source', 'marketing_campaign_trigger',
      'start_at', _campaign.start_at,
      'end_at', _campaign.end_at
    )
  FROM recipients r
  WHERE r.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_notifications n
      WHERE n.company_id = _campaign.company_id
        AND n.target_user_id = r.user_id
        AND n.type = 'marketing'
        AND n.metadata->>'campaign_id' = _campaign.id::text
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    INSERT INTO public.marketing_history(company_id, entity_type, entity_id, event, payload)
    VALUES (
      _campaign.company_id,
      'notification',
      _campaign.id,
      'auto_generated',
      jsonb_build_object('inserted', v_inserted)
    );
  END IF;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.mkt_campaign_notifications_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.mkt_generate_campaign_notifications(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_campaign_notifications ON public.marketing_campaigns;
CREATE TRIGGER trg_mkt_campaign_notifications
  AFTER INSERT OR UPDATE OF status, placements, audience_type, audience_filters, start_at, end_at, name, description, deleted_at
  ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.mkt_campaign_notifications_trigger();

DO $$
DECLARE
  v_campaign public.marketing_campaigns%ROWTYPE;
BEGIN
  FOR v_campaign IN
    SELECT *
    FROM public.marketing_campaigns
    WHERE deleted_at IS NULL
      AND status IN ('approved', 'scheduled', 'active')
      AND COALESCE(placements, ARRAY[]::TEXT[]) @> ARRAY['notifications']::TEXT[]
      AND (start_at IS NULL OR start_at <= now())
      AND (end_at IS NULL OR end_at >= now())
  LOOP
    PERFORM public.mkt_generate_campaign_notifications(v_campaign);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
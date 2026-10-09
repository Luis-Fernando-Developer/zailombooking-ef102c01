-- =====================================================================
-- Feature Registry + Release Notes + Platform Notifications
-- Rodar no SQL Editor do Supabase (idempotente).
-- =====================================================================

-- 1. FEATURE REGISTRY -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  technical_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated','reviewed','published')),
  tags TEXT[] DEFAULT '{}',
  plan_visibility TEXT[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feature_registry_status ON public.feature_registry(status);

-- 2. RELEASE NOTES ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.release_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  full_description TEXT,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  features_ids UUID[] DEFAULT '{}',
  target_plans TEXT[] DEFAULT '{}',
  target_companies UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_release_notes_status ON public.release_notes(status);

-- 3. PLATFORM NOTIFICATIONS ------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL DEFAULT 'feature_update',
  release_note_id UUID REFERENCES public.release_notes(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all','plans','companies','manual_selection')),
  target_plans TEXT[] DEFAULT '{}',
  target_companies UUID[] DEFAULT '{}',
  is_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_notifications_target ON public.platform_notifications(target_type);

-- 4. NOTIFICATION VIEWS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.platform_notifications(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_views_company ON public.notification_views(company_id);

-- =====================================================================
-- GRANTS (Data API). authenticated lê notifications; super_admin escreve via service_role.
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_registry       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.release_notes          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_notifications TO authenticated;
GRANT SELECT, INSERT                  ON public.notification_views    TO authenticated;
GRANT ALL ON public.feature_registry, public.release_notes, public.platform_notifications, public.notification_views TO service_role;

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.feature_registry       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_views     ENABLE ROW LEVEL SECURITY;

-- Helper: is_super_admin (assume tabela user_roles com role='super_admin')
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role::TEXT = 'super_admin'
  );
$$;

-- Feature registry: somente super_admin
DROP POLICY IF EXISTS feature_registry_admin_all ON public.feature_registry;
CREATE POLICY feature_registry_admin_all ON public.feature_registry
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Release notes: super_admin full; publicadas são lidas por authenticated
DROP POLICY IF EXISTS release_notes_admin_all ON public.release_notes;
CREATE POLICY release_notes_admin_all ON public.release_notes
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS release_notes_read_published ON public.release_notes;
CREATE POLICY release_notes_read_published ON public.release_notes
  FOR SELECT TO authenticated
  USING (status = 'published');

-- Platform notifications: super_admin full; authenticated lê
DROP POLICY IF EXISTS platform_notifications_admin_all ON public.platform_notifications;
CREATE POLICY platform_notifications_admin_all ON public.platform_notifications
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS platform_notifications_read_sent ON public.platform_notifications;
CREATE POLICY platform_notifications_read_sent ON public.platform_notifications
  FOR SELECT TO authenticated
  USING (is_sent = true);

-- Notification views: usuário cria sua própria view (qualquer authenticated)
DROP POLICY IF EXISTS notification_views_insert_own ON public.notification_views;
CREATE POLICY notification_views_insert_own ON public.notification_views
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS notification_views_select ON public.notification_views;
CREATE POLICY notification_views_select ON public.notification_views
  FOR SELECT TO authenticated
  USING (true);

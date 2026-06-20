-- ============================================================================
-- Notificações da empresa (in-app, por empresa) — para o sino do header
-- Rodar manualmente. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,            -- booking_created | schedule_request | generic | ...
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,                     -- rota interna (ex: /business/<slug>/bookings)
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  read_by     UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_notif_company_read
  ON public.company_notifications(company_id, is_read, created_at DESC);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_notifications TO authenticated;
GRANT ALL ON public.company_notifications TO service_role;

-- RLS
ALTER TABLE public.company_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members read notifs"      ON public.company_notifications;
DROP POLICY IF EXISTS "company members update notifs"    ON public.company_notifications;
DROP POLICY IF EXISTS "service role inserts notifs"      ON public.company_notifications;
DROP POLICY IF EXISTS "company members insert notifs"    ON public.company_notifications;

CREATE POLICY "company members read notifs"
  ON public.company_notifications FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "company members update notifs"
  ON public.company_notifications FOR UPDATE
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "company members insert notifs"
  ON public.company_notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 2028_services_image.sql
-- Adds image support for services + gates the feature by plan
-- ============================================================

-- 1) Column on services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2) Storage bucket (public so the landing page can render <img src>)
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3) Storage RLS policies
--    Path convention: <company_id>/<filename>
DROP POLICY IF EXISTS "service-images public read" ON storage.objects;
CREATE POLICY "service-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'service-images');

DROP POLICY IF EXISTS "service-images company write" ON storage.objects;
CREATE POLICY "service-images company write"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'service-images'
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "service-images company update" ON storage.objects;
CREATE POLICY "service-images company update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'service-images'
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "service-images company delete" ON storage.objects;
CREATE POLICY "service-images company delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'service-images'
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.owner_id = auth.uid()
  )
);

-- 4) Defense-in-depth: block image_url writes when plan is 'starter'
--    (Mirrors the LandingPage customizer gating: only non-starter plans
--     have access to landing-page customization features.)
CREATE OR REPLACE FUNCTION public.enforce_service_image_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  -- Only validate when image_url is actually being set / changed to non-null
  IF NEW.image_url IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(plan_id, 'starter')
    INTO v_plan
    FROM public.company_subscriptions
   WHERE company_id = NEW.company_id;

  IF v_plan IS NULL OR v_plan = 'starter' THEN
    RAISE EXCEPTION 'Service images require a paid plan (current plan: %).', COALESCE(v_plan, 'starter')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_service_image_plan ON public.services;
CREATE TRIGGER trg_enforce_service_image_plan
BEFORE INSERT OR UPDATE OF image_url ON public.services
FOR EACH ROW EXECUTE FUNCTION public.enforce_service_image_plan();

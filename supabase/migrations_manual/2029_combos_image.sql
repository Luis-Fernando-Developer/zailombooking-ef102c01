-- ============================================================
-- 2029_combos_image.sql
-- Adds image support for service combos (same gating as services)
-- Reuses the existing 'service-images' storage bucket created by 2028.
-- No edge function deploy required.
-- ============================================================

-- 1) Column on service_combos
ALTER TABLE public.service_combos
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2) Defense-in-depth: block image_url writes when plan is 'starter'
CREATE OR REPLACE FUNCTION public.enforce_combo_image_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
BEGIN
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
    RAISE EXCEPTION 'Combo images require a paid plan (current plan: %).', COALESCE(v_plan, 'starter')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_combo_image_plan ON public.service_combos;
CREATE TRIGGER trg_enforce_combo_image_plan
BEFORE INSERT OR UPDATE OF image_url ON public.service_combos
FOR EACH ROW EXECUTE FUNCTION public.enforce_combo_image_plan();

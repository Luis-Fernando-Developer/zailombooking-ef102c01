-- ============================================================
-- 2030_fix_image_plan_trigger.sql
-- Fix: plan_id in company_subscriptions is a UUID (FK -> subscription_plans.id).
-- The previous triggers compared it to text 'starter' and crashed with
--   "invalid input syntax for type uuid: 'starter'".
-- This migration rewrites both trigger functions to resolve the plan NAME
-- via subscription_plans and gate by name (lowercased).
-- Also (re)creates the 'service-images' bucket in case 2028 wasn't applied.
-- ============================================================

-- Ensure bucket exists (idempotent — safe if 2028 already ran)
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Helper: returns lowercased plan name for a company, or 'starter' if none.
CREATE OR REPLACE FUNCTION public._company_plan_name(_company_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(LOWER(sp.name), 'starter')
    FROM public.company_subscriptions cs
    LEFT JOIN public.subscription_plans sp ON sp.id = cs.plan_id
   WHERE cs.company_id = _company_id
   LIMIT 1;
$$;

-- Services
CREATE OR REPLACE FUNCTION public.enforce_service_image_plan()
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

  v_plan := COALESCE(public._company_plan_name(NEW.company_id), 'starter');

  IF v_plan = 'starter' THEN
    RAISE EXCEPTION 'Service images require a paid plan (current plan: %).', v_plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Combos
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

  v_plan := COALESCE(public._company_plan_name(NEW.company_id), 'starter');

  IF v_plan = 'starter' THEN
    RAISE EXCEPTION 'Combo images require a paid plan (current plan: %).', v_plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

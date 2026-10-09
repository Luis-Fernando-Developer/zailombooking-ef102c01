-- Migration 2095: Fix company registration plan and cycle persistence
-- This ensures that the plan_id and billing_period are correctly set during signup
-- and when a Super Admin edits a company.

-- First, ensure the columns exist and have correct defaults if needed
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'plan_id') THEN
        ALTER TABLE public.companies ADD COLUMN plan_id UUID REFERENCES public.subscription_plans(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'billing_period') THEN
        ALTER TABLE public.companies ADD COLUMN billing_period TEXT CHECK (billing_period IN ('monthly', 'quarterly', 'annual')) DEFAULT 'monthly';
    END IF;
END $$;

-- Update existing companies that might have a subscription but no plan_id/billing_period set on the company record itself
-- (This helps synchronization with Super Admin panel)
UPDATE public.companies c
SET 
    plan_id = sub.plan_id,
    billing_period = sub.billing_period
FROM public.company_subscriptions sub
WHERE c.id = sub.company_id
AND sub.status = 'active'
AND (c.plan_id IS NULL OR c.billing_period IS NULL);

-- Add a trigger to keep companies.plan_id and companies.billing_period in sync with the active subscription
CREATE OR REPLACE FUNCTION public.sync_company_plan_info()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'active') THEN
        UPDATE public.companies
        SET 
            plan_id = NEW.plan_id,
            billing_period = NEW.billing_period
        WHERE id = NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_company_plan_info ON public.company_subscriptions;
CREATE TRIGGER trg_sync_company_plan_info
AFTER INSERT OR UPDATE OF status, plan_id, billing_period ON public.company_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_company_plan_info();

GRANT ALL ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

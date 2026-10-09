-- Migration to add the missing 'theme' column to company_customizations
-- This fixes the error: Could not find the 'theme' column of 'company_customizations' in the schema cache

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'company_customizations' 
                   AND column_name = 'theme') THEN
        ALTER TABLE public.company_customizations ADD COLUMN theme JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Ensure necessary grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_customizations TO authenticated;
GRANT ALL ON public.company_customizations TO service_role;
GRANT SELECT ON public.company_customizations TO anon;

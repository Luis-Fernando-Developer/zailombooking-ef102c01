DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_customizations' AND column_name = 'theme') THEN
        ALTER TABLE public.company_customizations ADD COLUMN theme JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;
GRANT SELECT, UPDATE ON public.company_customizations TO authenticated;
GRANT SELECT ON public.company_customizations TO anon;
GRANT ALL ON public.company_customizations TO service_role;

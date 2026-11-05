ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS flow_custom_domain_validation_records JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS flow_custom_domain_ownership_verification JSONB;

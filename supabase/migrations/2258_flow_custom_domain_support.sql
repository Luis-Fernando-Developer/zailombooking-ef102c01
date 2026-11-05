ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS flow_custom_domain_cloudflare_id TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS flow_custom_domain_status TEXT NOT NULL DEFAULT 'not_configured';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS flow_custom_domain_verified_at TIMESTAMPTZ;

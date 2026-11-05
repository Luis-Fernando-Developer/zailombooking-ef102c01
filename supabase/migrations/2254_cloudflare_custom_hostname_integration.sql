-- 2254 — integração Cloudflare for SaaS para domínios próprios.
BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS custom_domain_cloudflare_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_validation_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_domain_ownership_verification JSONB,
  ADD COLUMN IF NOT EXISTS custom_domain_last_error TEXT;

CREATE INDEX IF NOT EXISTS companies_custom_domain_cloudflare_id_idx
  ON public.companies (custom_domain_cloudflare_id)
  WHERE custom_domain_cloudflare_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;

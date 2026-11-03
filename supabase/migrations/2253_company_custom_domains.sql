-- 2251 — domínios públicos por empresa (subdomínio Zailom + domínio próprio).
BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_subdomain TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_status TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS companies_booking_subdomain_unique
  ON public.companies (lower(booking_subdomain))
  WHERE booking_subdomain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_custom_domain_unique
  ON public.companies (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_custom_domain_status_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_custom_domain_status_check
  CHECK (custom_domain_status IN ('not_configured', 'pending', 'verified', 'error'));

CREATE OR REPLACE FUNCTION public.resolve_company_slug_by_host(p_host TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.slug
  FROM public.companies c
  WHERE c.status IN ('active', 'pending_payment')
    AND (
      (c.booking_subdomain IS NOT NULL
       AND lower(c.booking_subdomain || '.zailom.com') = lower(split_part(p_host, ':', 1)))
      OR
      (c.custom_domain IS NOT NULL
       AND c.custom_domain_status = 'verified'
       AND lower(c.custom_domain) = lower(split_part(p_host, ':', 1)))
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_company_slug_by_host(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_company_slug_by_host(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

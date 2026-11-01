-- Define qual modelo de endereço público a empresa utiliza.
-- Empresas existentes preservam o comportamento legado por Path.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_url_type TEXT NOT NULL DEFAULT 'path';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_booking_url_type_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_booking_url_type_check
  CHECK (booking_url_type IN ('custom_domain', 'subdomain', 'path'));

-- Compatibilidade com empresas que já tinham um endereço configurado.
UPDATE public.companies
SET booking_url_type = CASE
  WHEN custom_domain IS NOT NULL AND btrim(custom_domain) <> '' THEN 'custom_domain'
  WHEN booking_subdomain IS NOT NULL AND btrim(booking_subdomain) <> '' THEN 'subdomain'
  ELSE 'path'
END
WHERE booking_url_type = 'path'
  AND (
    (custom_domain IS NOT NULL AND btrim(custom_domain) <> '')
    OR (booking_subdomain IS NOT NULL AND btrim(booking_subdomain) <> '')
  );

NOTIFY pgrst, 'reload schema';

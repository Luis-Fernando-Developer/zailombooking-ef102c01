-- 2256: campos para controlar a sequência dos e-mails de pagamento e ativação.
BEGIN;
ALTER TABLE public.owner_company_confirmations
  ADD COLUMN IF NOT EXISTS payment_confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_setup_email_scheduled_at TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION public.resolve_company_slug_by_host(p_host TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.slug FROM public.companies c
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

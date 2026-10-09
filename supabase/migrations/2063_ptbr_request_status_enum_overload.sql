-- Fix: notify_request_status_changed passes request_status enum to ptbr_request_status(TEXT)
-- Postgres does not implicitly cast enums to TEXT, causing 42883 when updating requests.
-- Add an overload that accepts the enum and delegates to the TEXT version.

CREATE OR REPLACE FUNCTION public.ptbr_request_status(p_status public.request_status)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.ptbr_request_status(p_status::text);
$$;

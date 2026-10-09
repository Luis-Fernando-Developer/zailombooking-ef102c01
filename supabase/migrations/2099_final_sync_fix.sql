-- Migration 2099: Final Force Refresh and Column Sync
-- This migration ensures everything is synced and forces a cache reload one last time.

DO $$ 
BEGIN
    -- Ensure asaas_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_payments' AND column_name = 'asaas_id') THEN
        ALTER TABLE public.booking_payments ADD COLUMN asaas_id TEXT;
    END IF;

    -- Ensure status column is present and has correct default
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_payments' AND column_name = 'status') THEN
        ALTER TABLE public.booking_payments ALTER COLUMN status SET DEFAULT 'pending';
    END IF;
END $$;

-- Force PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';

-- Update any stuck payments if they have an asaas_id but are still pending
-- (Manual safety net for already processed webhooks that might have failed DB write due to cache)
-- This is risky so we only do it for very recent ones if needed, but the trigger 2097 should handle new ones.

GRANT ALL ON public.booking_payments TO service_role;
GRANT ALL ON public.bookings TO service_role;

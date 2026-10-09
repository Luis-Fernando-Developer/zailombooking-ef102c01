-- Migration 2098: Ensure asaas_id column and reload schema cache
-- This migration fixes the "column asaas_id does not exist" error by ensuring the column exists 
-- and forcing PostgREST to reload its schema cache.

DO $$ 
BEGIN
    -- 1. Ensure the column exists in booking_payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_payments' AND column_name = 'asaas_id') THEN
        -- If it was named differently before, you could rename it here, 
        -- but adding it as new is safer if we're unsure of previous migrations.
        ALTER TABLE public.booking_payments ADD COLUMN asaas_id TEXT;
        RAISE NOTICE 'Column asaas_id added to booking_payments';
    ELSE
        -- Ensure it's TEXT type
        ALTER TABLE public.booking_payments ALTER COLUMN asaas_id TYPE TEXT;
        RAISE NOTICE 'Column asaas_id already exists, ensured type is TEXT';
    END IF;

    -- 2. Ensure indexes for performance
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'booking_payments' AND indexname = 'idx_booking_payments_asaas_id') THEN
        CREATE INDEX idx_booking_payments_asaas_id ON public.booking_payments(asaas_id);
    END IF;
END $$;

-- 3. CRITICAL: Force PostgREST to reload the schema cache
-- This is often the cause of "column does not exist" errors in Supabase after migrations.
NOTIFY pgrst, 'reload schema';

-- 4. Re-grant permissions just in case
GRANT ALL ON public.booking_payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.booking_payments TO authenticated;
GRANT SELECT ON public.booking_payments TO anon;

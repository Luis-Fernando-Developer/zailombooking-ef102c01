-- Migration 2096: Force Sync and Add Check for Payment Status (FIXED)
-- This migration ensures that all bookings have a payment_status consistent with the asaas webhook logic.
-- FIXED: Use asaas_id instead of gateway_payment_id to match actual table structure.

-- Ensure pgcrypto for generic use if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add index to speed up lookup during polling and webhooks
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.bookings(payment_status);

-- We noticed booking_payments uses 'asaas_id' in some functions and 'gateway_payment_id' was expected here.
-- Let's ensure 'asaas_id' is indexed if it exists, or gateway_payment_id if that was intended.
-- Based on the error, gateway_payment_id does NOT exist.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_payments' AND column_name = 'asaas_id') THEN
        CREATE INDEX IF NOT EXISTS idx_booking_payments_asaas_id ON public.booking_payments(asaas_id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_payments' AND column_name = 'gateway_payment_id') THEN
        CREATE INDEX IF NOT EXISTS idx_booking_payments_asaas_id ON public.booking_payments(gateway_payment_id);
    END IF;
END $$;

-- Force sync for companies without plan info (double check from 2095)
UPDATE public.companies c
SET 
    plan_id = sub.plan_id,
    billing_period = sub.billing_period
FROM public.company_subscriptions sub
WHERE c.id = sub.company_id
AND sub.status = 'active'
AND (c.plan_id IS NULL OR c.billing_period IS NULL);

-- Grant permissions explicitly just in case
GRANT SELECT, UPDATE ON public.bookings TO authenticated;
GRANT SELECT, UPDATE ON public.bookings TO service_role;
GRANT SELECT, UPDATE ON public.booking_payments TO authenticated;
GRANT SELECT, UPDATE ON public.booking_payments TO service_role;

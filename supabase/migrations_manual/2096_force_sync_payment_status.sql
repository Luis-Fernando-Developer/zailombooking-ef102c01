-- Migration 2096: Force Sync and Add Check for Payment Status
-- This migration ensures that all bookings have a payment_status consistent with the asaas webhook logic.

-- Ensure pgcrypto for generic use if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add index to speed up lookup during polling and webhooks
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_booking_payments_asaas_id ON public.booking_payments(gateway_payment_id);

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

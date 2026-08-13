-- Migration 2097: Robust Payment Sync Trigger
-- This migration ensures that if the payment is marked as paid in booking_payments, 
-- the associated booking is automatically updated, even if the webhook fails one of the steps.

CREATE OR REPLACE FUNCTION public.sync_booking_payment_status()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid')) THEN
        UPDATE public.bookings
        SET 
            payment_status = 'paid',
            booking_status = 'confirmed',
            updated_at = now()
        WHERE id = NEW.booking_id;
        
        -- Trigger notification event if possible (though we'd prefer doing this in the webhook)
        -- We'll rely on the webhook for the notification since Edge Functions are better for that.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_booking_payment_status ON public.booking_payments;
CREATE TRIGGER trg_sync_booking_payment_status
AFTER INSERT OR UPDATE ON public.booking_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_booking_payment_status();

-- Ensure indices are correct
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_id ON public.booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_status ON public.booking_payments(status);

-- Final check on column names to avoid "gateway_payment_id" vs "asaas_id" confusion
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_payments' AND column_name = 'asaas_id') THEN
        RAISE NOTICE 'Column asaas_id exists in booking_payments';
    ELSE
        RAISE NOTICE 'Column asaas_id MISSING in booking_payments - this might be an issue';
    END IF;
END $$;

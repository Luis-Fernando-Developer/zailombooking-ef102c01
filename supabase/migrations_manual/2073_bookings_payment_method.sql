-- =====================================================================
-- 2073: campo payment_method em bookings (online | local | pending)
-- =====================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'local';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='bookings_payment_method_chk'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_payment_method_chk
      CHECK (payment_method IN ('online','local','pending'));
  END IF;
END $$;

-- Retroativo: se ja tem pagamento confirmado com asaas_payment_id, marcar online
UPDATE public.bookings
   SET payment_method = 'online'
 WHERE payment_method = 'local'
   AND (asaas_payment_id IS NOT NULL OR payment_status = 'confirmed');

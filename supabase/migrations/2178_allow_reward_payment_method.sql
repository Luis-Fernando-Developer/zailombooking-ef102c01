-- 2178: permitir bookings de brindes/premios no campo payment_method
-- Brindes gratuitos usam payment_method = 'reward' e payment_status = 'free'.
-- Brindes com valor continuam usando 'online' ou 'local'.

BEGIN;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_method_chk;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_chk
  CHECK (payment_method IN ('online', 'local', 'pending', 'reward'));

NOTIFY pgrst, 'reload schema';

COMMIT;

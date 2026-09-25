-- 2179: pagamentos online podem existir antes do booking.
-- O booking só é criado após a confirmação do pagamento.
BEGIN;

ALTER TABLE public.booking_payments
  ALTER COLUMN booking_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;

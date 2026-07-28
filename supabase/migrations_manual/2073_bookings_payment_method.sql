-- =====================================================================
-- 2073: campo payment_method em bookings (online | local | pending)
-- =====================================================================

-- 1) coluna (sem constraint ainda)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 2) normalizar valores existentes antes de aplicar CHECK
UPDATE public.bookings
   SET payment_method = 'online'
 WHERE payment_method IS DISTINCT FROM 'online'
   AND (asaas_payment_id IS NOT NULL OR payment_status = 'confirmed');

UPDATE public.bookings
   SET payment_method = 'local'
 WHERE payment_method IS NULL
    OR payment_method NOT IN ('online','local','pending');

-- 3) default + not null
ALTER TABLE public.bookings
  ALTER COLUMN payment_method SET DEFAULT 'local',
  ALTER COLUMN payment_method SET NOT NULL;

-- 4) constraint (agora seguro)
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

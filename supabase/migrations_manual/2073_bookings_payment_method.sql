-- =====================================================================
-- 2073: campo payment_method em bookings (online | local | pending)
-- =====================================================================

-- 1) coluna (sem constraint ainda)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 2) normalizar valores existentes antes de aplicar CHECK
DO $$
DECLARE
  has_asaas   boolean := EXISTS (SELECT 1 FROM information_schema.columns
                                  WHERE table_schema='public' AND table_name='bookings'
                                    AND column_name='asaas_payment_id');
  has_pstatus boolean := EXISTS (SELECT 1 FROM information_schema.columns
                                  WHERE table_schema='public' AND table_name='bookings'
                                    AND column_name='payment_status');
  cond text := 'FALSE';
BEGIN
  IF has_asaas AND has_pstatus THEN
    cond := 'asaas_payment_id IS NOT NULL OR payment_status = ''confirmed''';
  ELSIF has_asaas THEN
    cond := 'asaas_payment_id IS NOT NULL';
  ELSIF has_pstatus THEN
    cond := 'payment_status = ''confirmed''';
  END IF;

  EXECUTE format(
    'UPDATE public.bookings SET payment_method = ''online''
       WHERE payment_method IS DISTINCT FROM ''online'' AND (%s)',
    cond
  );
END $$;

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

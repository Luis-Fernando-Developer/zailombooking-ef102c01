-- 2184 — Pagamento local é considerado confirmado quando o serviço é concluído
BEGIN;

CREATE OR REPLACE FUNCTION public.mark_local_booking_paid_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF LOWER(COALESCE(NEW.booking_status::text, '')) = 'completed'
     AND LOWER(COALESCE(NEW.payment_method::text, '')) = 'local'
     AND LOWER(COALESCE(NEW.payment_status::text, '')) = 'pending' THEN
    NEW.payment_status := 'confirmed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_local_booking_paid_on_completion ON public.bookings;

CREATE TRIGGER trg_mark_local_booking_paid_on_completion
BEFORE UPDATE OF booking_status, payment_status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.mark_local_booking_paid_on_completion();

-- Corrige também registros locais que já foram concluídos antes desta migration.
-- O trigger de imutabilidade bloqueia UPDATE em agendamentos concluídos.
-- Desabilita somente esse trigger durante o backfill e o reabilita em seguida.
DO $
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'bookings'
       AND t.tgname = 'trg_prevent_locked_booking_update'
       AND NOT t.tgisinternal
  ) THEN
    ALTER TABLE public.bookings DISABLE TRIGGER trg_prevent_locked_booking_update;
  END IF;
END $;

UPDATE public.bookings
SET payment_status = 'confirmed'
WHERE LOWER(COALESCE(booking_status::text, '')) = 'completed'
  AND LOWER(COALESCE(payment_method::text, '')) = 'local'
  AND LOWER(COALESCE(payment_status::text, '')) = 'pending';

DO $
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'bookings'
       AND t.tgname = 'trg_prevent_locked_booking_update'
       AND NOT t.tgisinternal
  ) THEN
    ALTER TABLE public.bookings ENABLE TRIGGER trg_prevent_locked_booking_update;
  END IF;
END $;

REVOKE ALL ON FUNCTION public.mark_local_booking_paid_on_completion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_local_booking_paid_on_completion() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

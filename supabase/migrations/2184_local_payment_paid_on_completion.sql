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
UPDATE public.bookings
SET payment_status = 'confirmed'
WHERE LOWER(COALESCE(booking_status::text, '')) = 'completed'
  AND LOWER(COALESCE(payment_method::text, '')) = 'local'
  AND LOWER(COALESCE(payment_status::text, '')) = 'pending';

REVOKE ALL ON FUNCTION public.mark_local_booking_paid_on_completion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_local_booking_paid_on_completion() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

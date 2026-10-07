-- 2209 — concluir pagamento online em booking pending já existente
-- Cenário: cliente escolheu "Pagar no local", o booking foi criado como pending
-- e ocupa o slot. Depois ele pode clicar "Pagar agora". Nesse caso não existe
-- hold temporário: o booking existente é a reserva e deve ser convertido em
-- pagamento online sem criar um segundo registro de agendamento.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_existing_booking_payment(
  p_booking_id UUID,
  p_payment_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_payment public.booking_payments%ROWTYPE;
  v_is_service_role BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  SELECT *
    INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado.';
  END IF;

  IF NOT v_is_service_role AND NOT EXISTS (
    SELECT 1
      FROM public.clients c
     WHERE c.id = v_booking.client_id
       AND c.company_id = v_booking.company_id
       AND c.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Agendamento não pertence à sessão atual.';
  END IF;

  SELECT *
    INTO v_payment
    FROM public.booking_payments
   WHERE booking_id = p_booking_id
     AND asaas_id = p_payment_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado para este agendamento.';
  END IF;

  IF lower(COALESCE(v_payment.status::TEXT, '')) NOT IN ('confirmed','paid','received','settled') THEN
    RAISE EXCEPTION 'Pagamento ainda não foi confirmado pelo gateway.';
  END IF;

  UPDATE public.booking_payments
     SET status = 'confirmed',
         updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.bookings
     SET payment_status = 'paid',
         payment_method = 'online',
         booking_status = CASE
           WHEN lower(COALESCE(booking_status::TEXT, '')) IN ('cancelled','canceled','rejected','no_show')
             THEN booking_status
           ELSE 'confirmed'
         END,
         updated_at = now()
   WHERE id = p_booking_id;

  RETURN p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_existing_booking_payment(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_existing_booking_payment(UUID,TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

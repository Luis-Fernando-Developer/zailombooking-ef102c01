-- Espelha o padrão de `signup_payment_status` (que já funciona no cadastro):
-- RPC pública SECURITY DEFINER, imune a RLS, retornando booking + transação mais recente.

DROP FUNCTION IF EXISTS public.check_booking_payment_status(UUID);

CREATE OR REPLACE FUNCTION public.check_booking_payment_status(_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking_status TEXT;
    v_payment_status TEXT;
    v_tx RECORD;
    v_is_paid BOOLEAN := FALSE;
BEGIN
    SELECT booking_status::TEXT, payment_status::TEXT
      INTO v_booking_status, v_payment_status
      FROM bookings
     WHERE id = _booking_id;

    SELECT status::TEXT AS status, asaas_id, provider
      INTO v_tx
      FROM booking_payments
     WHERE booking_id = _booking_id
     ORDER BY created_at DESC
     LIMIT 1;

    -- Qualquer sinal de liquidação vindo do gateway conta como pago.
    IF  lower(coalesce(v_payment_status, '')) IN ('paid','confirmed','received','received_in_cash','settled')
     OR lower(coalesce(v_booking_status, '')) IN ('paid')
     OR lower(coalesce(v_tx.status, '')) ~ '(paid|confirm|received|settled)'
    THEN
        v_is_paid := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'is_paid', v_is_paid,
        'booking_status', v_booking_status,
        'payment_status', v_payment_status,
        'transaction_status', v_tx.status,
        'asaas_id', v_tx.asaas_id,
        'provider', v_tx.provider
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_booking_payment_status(UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

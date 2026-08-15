CREATE OR REPLACE FUNCTION public.check_booking_payment_status(_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking_status TEXT;
    v_payment_status TEXT;
    v_transaction_status TEXT;
    v_is_paid BOOLEAN := FALSE;
BEGIN
    -- Get status from bookings table
    SELECT booking_status, payment_status 
    INTO v_booking_status, v_payment_status
    FROM bookings 
    WHERE id = _booking_id;

    -- Get status from booking_payments table (most recent)
    SELECT status 
    INTO v_transaction_status
    FROM booking_payments 
    WHERE booking_id = _booking_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Unified logic for "paid" status
    -- Consistent with Asaas webhook possible statuses
    IF 
        v_payment_status IN ('paid', 'confirmed', 'received', 'received_in_cash') OR
        v_booking_status IN ('confirmed', 'paid') OR
        v_transaction_status IN ('paid', 'confirmed', 'received', 'received_in_cash', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
    THEN
        v_is_paid := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'is_paid', v_is_paid,
        'booking_status', v_booking_status,
        'payment_status', v_payment_status,
        'transaction_status', v_transaction_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_booking_payment_status(UUID) TO anon, authenticated, service_role;

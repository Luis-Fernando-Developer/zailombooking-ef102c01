-- 2251 — aceitar IDs textuais de gateway na confirmação de pagamentos online.
-- asaas_id pode ser UUID em instalações legadas; provider_payment_id é TEXT.
-- A comparação via ::text evita que IDs como "klk6ba3u7xr4ztkb" sejam convertidos para UUID.

DO $$
DECLARE
  v_signature TEXT;
  v_definition TEXT;
  v_updated TEXT;
  v_signatures TEXT[] := ARRAY[
    'public.confirm_online_booking_payment(uuid,text)',
    'public.confirm_existing_booking_payment(uuid,text)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT pg_get_functiondef(to_regprocedure(v_signature))
      INTO v_definition;

    v_updated := replace(
      v_definition,
      'WHERE asaas_id = p_payment_id',
      'WHERE provider_payment_id = p_payment_id OR asaas_id::text = p_payment_id'
    );

    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Não foi possível localizar a busca legada de pagamento em %', v_signature;
    END IF;

    EXECUTE v_updated;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

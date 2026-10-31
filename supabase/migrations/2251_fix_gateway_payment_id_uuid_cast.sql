-- 2251 — aceitar IDs textuais de gateway na confirmação de pagamentos online.
-- asaas_id pode ser UUID em instalações legadas; provider_payment_id é TEXT.
-- A comparação com asaas_id::text evita casts de IDs alfanuméricos para UUID.

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

    -- Regex tolera diferenças de espaços, quebras de linha e AND/WHERE
    -- na definição retornada pelo PostgreSQL.
    v_updated := regexp_replace(
      v_definition,
      'asaas_id[[:space:]]*=[[:space:]]*p_payment_id',
      '(provider_payment_id = p_payment_id OR asaas_id::text = p_payment_id)',
      'gi'
    );

    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Não foi possível localizar a comparação asaas_id/p_payment_id em %', v_signature;
    END IF;

    EXECUTE v_updated;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

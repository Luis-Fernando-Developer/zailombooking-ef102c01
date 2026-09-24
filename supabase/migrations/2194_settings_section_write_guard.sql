-- FASE 10.16 — escrita por seção.
-- settings.manage é necessário para editar, mas a seção correspondente
-- também precisa estar autorizada para visualização.

CREATE OR REPLACE FUNCTION public.guard_settings_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := COALESCE(NEW.company_id, OLD.company_id);
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role IN ('service_role', 'postgres') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_role <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT public.user_has_company_permission(v_company_id, 'settings.manage') THEN
    RAISE EXCEPTION 'Permission denied: settings.manage';
  END IF;

  IF TG_TABLE_NAME = 'companies' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;

    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.address IS DISTINCT FROM OLD.address
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      IF NOT public.user_has_company_permission(v_company_id, 'settings.view_company_info') THEN
        RAISE EXCEPTION 'Permission denied: settings.view_company_info';
      END IF;
    END IF;

    IF NEW.booking_settings IS DISTINCT FROM OLD.booking_settings THEN
      IF NOT public.user_has_company_permission(v_company_id, 'settings.view_booking') THEN
        RAISE EXCEPTION 'Permission denied: settings.view_booking';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'company_payment_settings' THEN
    IF TG_OP = 'INSERT' THEN
      IF NOT (
        public.user_has_company_permission(v_company_id, 'settings.view_payments')
        OR public.user_has_company_permission(v_company_id, 'settings.view_payout_flow')
        OR public.user_has_company_permission(v_company_id, 'settings.view_payment_methods')
      ) THEN
        RAISE EXCEPTION 'Permission denied: payment settings section';
      END IF;
    ELSE
      IF NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
         OR NEW.own_gateway_provider IS DISTINCT FROM OLD.own_gateway_provider
         OR NEW.own_gateway_api_key_encrypted IS DISTINCT FROM OLD.own_gateway_api_key_encrypted THEN
        IF NOT public.user_has_company_permission(v_company_id, 'settings.view_payments') THEN
          RAISE EXCEPTION 'Permission denied: settings.view_payments';
        END IF;
      END IF;

      IF NEW.payout_flow IS DISTINCT FROM OLD.payout_flow THEN
        IF NOT public.user_has_company_permission(v_company_id, 'settings.view_payout_flow') THEN
          RAISE EXCEPTION 'Permission denied: settings.view_payout_flow';
        END IF;
      END IF;

      IF NEW.accepted_methods IS DISTINCT FROM OLD.accepted_methods THEN
        IF NOT public.user_has_company_permission(v_company_id, 'settings.view_payment_methods') THEN
          RAISE EXCEPTION 'Permission denied: settings.view_payment_methods';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

NOTIFY pgrst, 'reload schema';

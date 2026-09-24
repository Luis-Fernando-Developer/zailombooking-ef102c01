-- FASE 10.15 — proteção de escrita das configurações.
-- Frontend pode ser alterado via DevTools; autorização real fica no banco.
-- service_role/Edge Functions continuam podendo executar operações internas.

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
  IF v_role IN ('service_role', 'postgres') OR auth.uid() IS NULL AND v_role IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_role <> 'authenticated' OR NOT public.user_has_company_permission(v_company_id, 'settings.manage') THEN
    RAISE EXCEPTION 'Permission denied: settings.manage';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies', 'company_payment_settings'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_settings_write ON public.%I', t);

    EXECUTE format(
      'CREATE TRIGGER trg_guard_settings_write
       BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.guard_settings_write()',
      t
    );
  END LOOP;
END $$;

-- A assinatura nunca pode ser alterada diretamente pelo cliente autenticado.
-- Alterações de plano passam pelas Edge Functions protegidas por subscription.manage.
CREATE OR REPLACE FUNCTION public.guard_subscription_write()
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

  IF v_role <> 'authenticated' OR NOT public.user_has_company_permission(v_company_id, 'subscription.manage') THEN
    RAISE EXCEPTION 'Permission denied: subscription.manage';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.company_subscriptions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_subscription_write ON public.company_subscriptions;
    CREATE TRIGGER trg_guard_subscription_write
      BEFORE INSERT OR UPDATE OR DELETE ON public.company_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_write();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.guard_settings_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_subscription_write() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

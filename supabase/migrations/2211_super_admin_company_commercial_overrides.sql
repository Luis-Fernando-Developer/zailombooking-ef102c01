-- 2211 — Overrides comerciais para empresas criadas manualmente
-- Permite ao Super Admin definir instâncias WhatsApp extras sem alterar
-- os limites oficiais do plano.

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS extra_whatsapp_instances INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_extra_whatsapp_instances_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_extra_whatsapp_instances_check
  CHECK (extra_whatsapp_instances >= 0);

CREATE OR REPLACE FUNCTION public.whatsapp_get_plan_limits(p_company UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan_name TEXT;
  v_tier TEXT := 'starter';
  v_base_conn INT;
  v_max_conn INT;
  v_max_msg INT;
  v_extra_conn INT := 0;
  v_cur_conn INT;
  v_cur_msg INT;
  v_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
BEGIN
  SELECT lower(sp.name) INTO v_plan_name
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
   WHERE cs.company_id = p_company
   LIMIT 1;

  IF v_plan_name IS NULL THEN
    v_tier := 'starter';
  ELSIF v_plan_name ILIKE '%enterprise%' OR v_plan_name ILIKE '%business%' THEN
    v_tier := 'enterprise';
  ELSIF v_plan_name ILIKE '%professional%' OR v_plan_name ILIKE '%pro%' THEN
    v_tier := 'professional';
  ELSE
    v_tier := 'starter';
  END IF;

  IF v_tier = 'enterprise' THEN
    v_base_conn := NULL;
    v_max_msg := NULL;
  ELSIF v_tier = 'professional' THEN
    v_base_conn := 3;
    v_max_msg := 5000;
  ELSE
    v_base_conn := 1;
    v_max_msg := 700;
  END IF;

  SELECT COALESCE(extra_whatsapp_instances, 0)
    INTO v_extra_conn
    FROM companies
   WHERE id = p_company;

  IF v_base_conn IS NULL THEN
    v_max_conn := NULL;
  ELSE
    v_max_conn := v_base_conn + GREATEST(0, COALESCE(v_extra_conn, 0));
  END IF;

  SELECT COUNT(*) INTO v_cur_conn
    FROM whatsapp_instances
   WHERE company_id = p_company;

  SELECT COALESCE(sent_count, 0) INTO v_cur_msg
    FROM whatsapp_message_usage
   WHERE company_id = p_company AND year_month = v_month;

  v_cur_msg := COALESCE(v_cur_msg, 0);

  RETURN jsonb_build_object(
    'plan_tier', v_tier,
    'plan_name', v_plan_name,
    'base_max_connections', v_base_conn,
    'extra_connections', GREATEST(0, COALESCE(v_extra_conn, 0)),
    'max_connections', v_max_conn,
    'max_messages_month', v_max_msg,
    'current_connections', v_cur_conn,
    'current_messages_month', v_cur_msg,
    'connections_allowed', (v_max_conn IS NULL OR v_cur_conn < v_max_conn),
    'messages_allowed', (v_max_msg IS NULL OR v_cur_msg < v_max_msg)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.whatsapp_get_plan_limits(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- 2071: corrige valores da tabela plan_limits (fonte da verdade).
-- Convenção: -1 = ilimitado.
-- =====================================================================

-- 1) colunas que podem não existir em instalações antigas
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS white_label BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS max_employees          INTEGER,
  ADD COLUMN IF NOT EXISTS max_services           INTEGER,
  ADD COLUMN IF NOT EXISTS max_bookings_month     INTEGER,
  ADD COLUMN IF NOT EXISTS max_chatbots           INTEGER,
  ADD COLUMN IF NOT EXISTS max_whatsapp_instances INTEGER,
  ADD COLUMN IF NOT EXISTS max_integrations       INTEGER,
  ADD COLUMN IF NOT EXISTS max_chatbot_messages   INTEGER,
  ADD COLUMN IF NOT EXISTS features               JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.plan_limits SET plan_name = COALESCE(plan_name, initcap(plan_id::text));

-- 2) upsert dos 3 planos com os valores canônicos.
--
-- IMPORTANTE: em algumas bases antigas `plan_limits.plan_id` era TEXT; na base
-- atual ele é UUID e referencia `subscription_plans.id`. Por isso esta rotina
-- detecta o tipo da coluna e, quando for UUID, resolve o ID real pelo nome do
-- plano em `subscription_plans` em vez de tentar gravar 'starter' como UUID.
DO $$
DECLARE
  v_plan_id_udt TEXT;
  v_upserted_count INTEGER := 0;
BEGIN
  SELECT c.udt_name
    INTO v_plan_id_udt
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'plan_limits'
     AND c.column_name = 'plan_id'
   LIMIT 1;

  IF v_plan_id_udt = 'uuid' THEN
    WITH canonical AS (
      SELECT *
      FROM (VALUES
        ('starter'::TEXT,      'Starter'::TEXT,       1,  5,  200,  1,  1,  2,   700, false, '["Suporte por email"]'::jsonb),
        ('professional'::TEXT, 'Professional'::TEXT,  5, 12,  700,  3,  3, 10,  5000, true,  '["Relatorios avancados","Suporte prioritario","White label"]'::jsonb),
        ('enterprise'::TEXT,   'Enterprise'::TEXT,   -1, -1,   -1, -1, -1, -1,    -1, true,  '["API Completa","Gerente de conta dedicado","White label"]'::jsonb)
      ) AS v(plan_key, plan_name, max_employees, max_services, max_bookings_month,
             max_chatbots, max_whatsapp_instances, max_integrations,
             max_chatbot_messages, white_label, features)
    ), matched_plans AS (
      SELECT DISTINCT ON (plan_key)
             plan_key,
             id AS plan_id
        FROM (
          SELECT
            CASE
              WHEN lower(coalesce(sp.name, '')) LIKE '%enterprise%'
                OR lower(coalesce(sp.name, '')) LIKE '%business%'
                THEN 'enterprise'
              WHEN lower(coalesce(sp.name, '')) LIKE '%professional%'
                OR lower(coalesce(sp.name, '')) LIKE '%pro%'
                THEN 'professional'
              WHEN lower(coalesce(sp.name, '')) LIKE '%starter%'
                THEN 'starter'
              ELSE NULL
            END AS plan_key,
            sp.id,
            sp.is_active,
            sp.monthly_price,
            sp.name
          FROM public.subscription_plans sp
        ) resolved
       WHERE plan_key IS NOT NULL
       ORDER BY plan_key, is_active DESC NULLS LAST, monthly_price ASC NULLS LAST, name ASC
    ), upserted AS (
      INSERT INTO public.plan_limits
        (plan_id, plan_name, max_employees, max_services, max_bookings_month,
         max_chatbots, max_whatsapp_instances, max_integrations,
         max_chatbot_messages, white_label, features)
      SELECT
        mp.plan_id,
        c.plan_name,
        c.max_employees,
        c.max_services,
        c.max_bookings_month,
        c.max_chatbots,
        c.max_whatsapp_instances,
        c.max_integrations,
        c.max_chatbot_messages,
        c.white_label,
        c.features
      FROM canonical c
      JOIN matched_plans mp ON mp.plan_key = c.plan_key
      ON CONFLICT (plan_id) DO UPDATE SET
        plan_name              = EXCLUDED.plan_name,
        max_employees          = EXCLUDED.max_employees,
        max_services           = EXCLUDED.max_services,
        max_bookings_month     = EXCLUDED.max_bookings_month,
        max_chatbots           = EXCLUDED.max_chatbots,
        max_whatsapp_instances = EXCLUDED.max_whatsapp_instances,
        max_integrations       = EXCLUDED.max_integrations,
        max_chatbot_messages   = EXCLUDED.max_chatbot_messages,
        white_label            = EXCLUDED.white_label,
        features               = EXCLUDED.features,
        updated_at             = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_upserted_count FROM upserted;

    IF v_upserted_count < 3 THEN
      RAISE NOTICE '2071: % plano(s) atualizado(s). Verifique se subscription_plans possui Starter, Professional e Enterprise ativos.', v_upserted_count;
    END IF;
  ELSE
    INSERT INTO public.plan_limits
      (plan_id, plan_name, max_employees, max_services, max_bookings_month,
       max_chatbots, max_whatsapp_instances, max_integrations,
       max_chatbot_messages, white_label, features)
    VALUES
      ('starter',      'Starter',      1,  5,   200,  1,  1,  2,   700, false,
       '["Suporte por email"]'::jsonb),
      ('professional', 'Professional', 5, 12,   700,  3,  3, 10,  5000, true,
       '["Relatorios avancados","Suporte prioritario","White label"]'::jsonb),
      ('enterprise',   'Enterprise',  -1, -1,    -1, -1, -1, -1,    -1, true,
       '["API Completa","Gerente de conta dedicado","White label"]'::jsonb)
    ON CONFLICT (plan_id) DO UPDATE SET
      plan_name              = EXCLUDED.plan_name,
      max_employees          = EXCLUDED.max_employees,
      max_services           = EXCLUDED.max_services,
      max_bookings_month     = EXCLUDED.max_bookings_month,
      max_chatbots           = EXCLUDED.max_chatbots,
      max_whatsapp_instances = EXCLUDED.max_whatsapp_instances,
      max_integrations       = EXCLUDED.max_integrations,
      max_chatbot_messages   = EXCLUDED.max_chatbot_messages,
      white_label            = EXCLUDED.white_label,
      features               = EXCLUDED.features,
      updated_at             = now();
  END IF;
END $$;

-- 3) RLS: leitura pública já existe; garantir UPDATE apenas para super_admin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE tablename='plan_limits' AND policyname='Super admin manages plan limits') THEN
    DROP POLICY "Super admin manages plan limits" ON public.plan_limits;
  END IF;
END $$;

CREATE POLICY "Super admin manages plan limits"
  ON public.plan_limits
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

GRANT SELECT ON public.plan_limits TO anon, authenticated;
GRANT ALL    ON public.plan_limits TO service_role;

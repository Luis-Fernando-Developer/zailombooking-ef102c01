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

UPDATE public.plan_limits SET plan_name = COALESCE(plan_name, initcap(plan_id));

-- 2) upsert dos 3 planos com os valores canônicos
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

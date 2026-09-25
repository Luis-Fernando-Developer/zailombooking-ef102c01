-- Brindes: permitir vários serviços como recompensa.
--
-- Mantemos client_rewards.reward_service_id por compatibilidade com dados/código
-- antigos, mas a fonte de verdade para a seleção múltipla passa a ser
-- client_reward_services.

CREATE TABLE IF NOT EXISTS public.client_reward_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.client_rewards(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reward_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_client_reward_services_reward_id
  ON public.client_reward_services(reward_id);

CREATE INDEX IF NOT EXISTS idx_client_reward_services_service_id
  ON public.client_reward_services(service_id);

-- Migra o antigo serviço único para a nova relação.
INSERT INTO public.client_reward_services (reward_id, service_id)
SELECT cr.id, cr.reward_service_id
FROM public.client_rewards cr
WHERE cr.reward_service_id IS NOT NULL
ON CONFLICT (reward_id, service_id) DO NOTHING;

ALTER TABLE public.client_reward_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_reward_services_select ON public.client_reward_services;
CREATE POLICY client_reward_services_select
ON public.client_reward_services
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.client_rewards cr
    WHERE cr.id = client_reward_services.reward_id
      AND public.user_has_company_permission(cr.company_id, 'services.view')
  )
);

DROP POLICY IF EXISTS client_reward_services_insert ON public.client_reward_services;
CREATE POLICY client_reward_services_insert
ON public.client_reward_services
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.client_rewards cr
    WHERE cr.id = client_reward_services.reward_id
      AND public.user_has_company_permission(cr.company_id, 'services.edit')
  )
);

DROP POLICY IF EXISTS client_reward_services_update ON public.client_reward_services;
CREATE POLICY client_reward_services_update
ON public.client_reward_services
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.client_rewards cr
    WHERE cr.id = client_reward_services.reward_id
      AND public.user_has_company_permission(cr.company_id, 'services.edit')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.client_rewards cr
    WHERE cr.id = client_reward_services.reward_id
      AND public.user_has_company_permission(cr.company_id, 'services.edit')
  )
);

DROP POLICY IF EXISTS client_reward_services_delete ON public.client_reward_services;
CREATE POLICY client_reward_services_delete
ON public.client_reward_services
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.client_rewards cr
    WHERE cr.id = client_reward_services.reward_id
      AND public.user_has_company_permission(cr.company_id, 'services.edit')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.client_reward_services
TO authenticated;

NOTIFY pgrst, 'reload schema';

-- FASE 10.14 — permissões por seção em Configurações.
-- A fonte de verdade continua sendo employee_permissions.
-- settings.view = acesso ao menu; as permissões abaixo controlam cada seção.

INSERT INTO public.permissions (code, name, description, module, is_active, sort_order)
VALUES
  ('settings.view_company_info', 'Visualizar informações da empresa', 'Acessar a seção de informações básicas da empresa.', 'settings', true, 61),
  ('settings.view_booking', 'Visualizar configurações de agendamento', 'Acessar a seção de configurações de agendamento.', 'settings', true, 62),
  ('settings.view_payments', 'Visualizar pagamentos online', 'Acessar a seção de pagamentos online e configuração do gateway.', 'settings', true, 63),
  ('settings.view_payout_flow', 'Visualizar fluxo de repasse para autônomos', 'Acessar a seção de fluxo de repasse para profissionais autônomos.', 'settings', true, 64),
  ('settings.view_payment_methods', 'Visualizar métodos aceitos', 'Acessar a seção de métodos de pagamento aceitos.', 'settings', true, 65),
  ('settings.view_plan', 'Visualizar plano atual', 'Acessar a seção do plano atual da empresa.', 'settings', true, 66)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

-- Visualização da landing page nunca concede escrita.
DO $$
BEGIN
  IF to_regclass('public.company_customizations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "company_customizations_permission_insert" ON public.company_customizations;
    DROP POLICY IF EXISTS "company_customizations_permission_update" ON public.company_customizations;

    CREATE POLICY "company_customizations_permission_insert"
      ON public.company_customizations FOR INSERT TO authenticated
      WITH CHECK (
        public.user_has_company_permission(company_id, 'settings.manage')
      );

    CREATE POLICY "company_customizations_permission_update"
      ON public.company_customizations FOR UPDATE TO authenticated
      USING (
        public.user_has_company_permission(company_id, 'settings.manage')
      )
      WITH CHECK (
        public.user_has_company_permission(company_id, 'settings.manage')
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

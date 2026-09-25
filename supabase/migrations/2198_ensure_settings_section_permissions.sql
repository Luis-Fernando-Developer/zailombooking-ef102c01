-- FASE 10.14 — garantir catálogo das permissões por seção de Configurações.
-- Idempotente: reativa/atualiza as seis permissões criadas para o controle granular.

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
    is_active = true,
    sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';

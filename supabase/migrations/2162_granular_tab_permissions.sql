-- FASE 9: permissões granulares para abas dos módulos Horários, Serviços,
-- Marketing e Configurações.
-- A fonte de verdade continua sendo employee_permissions.
-- RLS não é alterada nesta migration.

INSERT INTO public.permissions (code, name, description, module, is_active, sort_order)
VALUES
  ('schedules.view_establishment', 'Visualizar horários do estabelecimento', 'Acessar a configuração de horários de funcionamento do estabelecimento.', 'schedules', true, 60),
  ('schedules.view_fixed', 'Visualizar horários dos fixos', 'Acessar a jornada e os horários dos colaboradores fixos.', 'schedules', true, 61),
  ('schedules.view_autonomous', 'Visualizar horários dos autônomos', 'Acessar a disponibilidade e os horários dos profissionais autônomos.', 'schedules', true, 62),
  ('schedules.view_absences', 'Visualizar ausências', 'Acessar a gestão de ausências dentro de Horários.', 'schedules', true, 63),
  ('schedules.view_blocks', 'Visualizar bloqueios', 'Acessar os bloqueios de horários.', 'schedules', true, 64),
  ('schedules.view_shifts', 'Visualizar escalas', 'Acessar ciclos, modelos e escalas.', 'schedules', true, 65),
  ('schedules.view_breaks', 'Visualizar intervalos', 'Acessar a gestão de intervalos.', 'schedules', true, 66),
  ('schedules.view_rules', 'Visualizar regras de horários', 'Acessar as regras de horários e disponibilidade.', 'schedules', true, 67),

  ('services.view_services', 'Visualizar serviços', 'Acessar a aba de serviços.', 'services', true, 60),
  ('services.view_combos', 'Visualizar combos', 'Acessar a aba de combos.', 'services', true, 61),
  ('services.view_gifts', 'Visualizar brindes', 'Acessar a aba de brindes.', 'services', true, 62),

  ('marketing.view_materials', 'Visualizar materiais de marketing', 'Acessar a aba de materiais.', 'marketing', true, 60),
  ('marketing.view_campaigns', 'Visualizar campanhas de marketing', 'Acessar a aba de campanhas.', 'marketing', true, 61),
  ('marketing.view_approvals', 'Visualizar aprovações de marketing', 'Acessar a aba de aprovações.', 'marketing', true, 62),
  ('marketing.view_history', 'Visualizar histórico de marketing', 'Acessar a aba de histórico.', 'marketing', true, 63),

  ('settings.view_landing_page', 'Visualizar personalização da Landing Page', 'Acessar a personalização da Landing Page nas configurações.', 'settings', true, 60)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';

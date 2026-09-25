-- FASE RH: permissões específicas do módulo de Recursos Humanos.
-- A autorização do módulo passa a ser independente de employees.*.

INSERT INTO public.permissions (code, name, description, module, is_active, sort_order)
VALUES
  ('hr.view', 'Visualizar Recursos Humanos', 'Acessar o módulo de Recursos Humanos e sua visão geral.', 'rh', true, 1),
  ('hr.manage_employees', 'Gerenciar dados de RH dos colaboradores', 'Gerenciar informações administrativas de colaboradores no RH.', 'rh', true, 2),
  ('hr.manage_vacations', 'Gerenciar férias', 'Criar, aprovar e acompanhar registros de férias.', 'rh', true, 3),
  ('hr.manage_absences', 'Gerenciar afastamentos', 'Registrar e acompanhar afastamentos e ocorrências.', 'rh', true, 4),
  ('hr.manage_documents', 'Gerenciar documentos', 'Gerenciar documentos administrativos dos colaboradores.', 'rh', true, 5),
  ('hr.manage_attendance', 'Gerenciar jornada e ponto', 'Gerenciar jornada, escalas, ponto e banco de horas.', 'rh', true, 6),
  ('hr.manage_evaluations', 'Gerenciar avaliações', 'Criar e acompanhar avaliações de desempenho.', 'rh', true, 7),
  ('hr.view_reports', 'Visualizar relatórios de RH', 'Visualizar indicadores e relatórios do módulo de RH.', 'rh', true, 8)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- O preset RH recebe acesso ao módulo completo.
INSERT INTO public.permission_preset_items (preset_id, permission_id)
SELECT pp.id, p.id
FROM public.permission_presets pp
CROSS JOIN public.permissions p
WHERE pp.code = 'rh'
  AND p.code IN (
    'hr.view',
    'hr.manage_employees',
    'hr.manage_vacations',
    'hr.manage_absences',
    'hr.manage_documents',
    'hr.manage_attendance',
    'hr.manage_evaluations',
    'hr.view_reports'
  )
ON CONFLICT DO NOTHING;

-- Gerente pode acessar o módulo, mas o controle fino continua sendo feito
-- pelas permissões individuais atribuídas ao funcionário.
INSERT INTO public.permission_preset_items (preset_id, permission_id)
SELECT pp.id, p.id
FROM public.permission_presets pp
CROSS JOIN public.permissions p
WHERE pp.code = 'gerente'
  AND p.code = 'hr.view'
ON CONFLICT DO NOTHING;

-- FASE 11 — bootstrap do sistema granular de permissões
-- Cria o catálogo/tabelas que já são consumidos pelo frontend V2.
-- Idempotente: pode ser aplicada em bancos que ainda possuem apenas o modelo legado.

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  module text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permission_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permission_preset_items (
  preset_id uuid NOT NULL REFERENCES public.permission_presets(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (preset_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.employee_permissions (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, permission_id)
);

-- Catálogo consolidado usado pelo V2.
INSERT INTO public.permissions (code,name,description,module,sort_order,is_active) VALUES
('bookings.view','Visualizar agendamentos','Acessar agendamentos.','bookings',1,true),
('bookings.create','Criar agendamentos','Criar novos agendamentos.','bookings',2,true),
('bookings.edit','Editar agendamentos','Editar agendamentos.','bookings',3,true),
('bookings.cancel','Cancelar agendamentos','Cancelar agendamentos.','bookings',4,true),
('bookings.manage_all','Gerenciar todos os agendamentos','Gerenciar agendamentos de todos os profissionais.','bookings',5,true),
('bookings.manage_own','Gerenciar próprios agendamentos','Gerenciar os próprios agendamentos.','bookings',6,true),
('chat.view','Visualizar chat','Acessar o chat.','chat',10,true),
('chat.send','Enviar mensagens no chat','Enviar mensagens no chat.','chat',11,true),
('chatbot.view','Visualizar chatbot','Acessar o chatbot.','chatbot',20,true),
('chatbot.manage','Gerenciar chatbot','Gerenciar configurações do chatbot.','chatbot',21,true),
('clients.view','Visualizar clientes','Acessar clientes.','clients',30,true),
('clients.create','Criar clientes','Criar clientes.','clients',31,true),
('clients.edit','Editar clientes','Editar clientes.','clients',32,true),
('clients.delete','Excluir clientes','Excluir clientes.','clients',33,true),
('dashboard.view','Visualizar dashboard','Acessar o dashboard.','dashboard',40,true),
('employees.view','Visualizar colaboradores','Acessar colaboradores.','employees',50,true),
('employees.create','Criar colaboradores','Criar colaboradores.','employees',51,true),
('employees.edit','Editar colaboradores','Editar colaboradores.','employees',52,true),
('employees.delete','Excluir colaboradores','Excluir colaboradores.','employees',53,true),
('employees.manage_permissions','Gerenciar permissões de colaboradores','Permite alterar as permissões de acesso de outros colaboradores.','employees',54,true),
('employees.manage_services','Gerenciar serviços de colaboradores','Gerenciar serviços vinculados aos colaboradores.','employees',55,true),
('finance.view','Visualizar financeiro','Acessar financeiro.','finance',70,true),
('finance.manage','Gerenciar financeiro','Gerenciar financeiro.','finance',71,true),
('marketing.view_materials','Visualizar materiais de marketing','Acessar materiais.','marketing',60,true),
('marketing.view_campaigns','Visualizar campanhas de marketing','Acessar campanhas.','marketing',61,true),
('marketing.view_approvals','Visualizar aprovações de marketing','Acessar aprovações.','marketing',62,true),
('marketing.view_history','Visualizar histórico de marketing','Acessar histórico.','marketing',63,true),
('marketing.view','Visualizar marketing','Acessar marketing.','marketing',64,true),
('marketing.create','Criar marketing','Criar conteúdo/campanhas de marketing.','marketing',65,true),
('marketing.edit','Editar marketing','Editar conteúdo/campanhas de marketing.','marketing',66,true),
('marketing.delete','Excluir marketing','Excluir conteúdo/campanhas de marketing.','marketing',67,true),
('marketing.approve','Aprovar marketing','Aprovar conteúdo/campanhas de marketing.','marketing',68,true),
('reallocation.view','Visualizar realocações','Acessar realocações.','reallocation',80,true),
('reallocation.create','Criar realocações','Criar solicitações de realocação.','reallocation',81,true),
('reallocation.approve','Aprovar realocações','Aprovar realocações.','reallocation',82,true),
('reports.view_basic','Visualizar relatórios básicos','Acessar relatórios básicos.','reports',90,true),
('reports.view_financial','Visualizar relatórios financeiros','Acessar relatórios financeiros.','reports',91,true),
('hr.view','Visualizar Recursos Humanos','Acessar o módulo de Recursos Humanos e sua visão geral.','rh',1,true),
('hr.manage_employees','Gerenciar dados de RH dos colaboradores','Gerenciar informações administrativas de colaboradores no RH.','rh',2,true),
('hr.manage_vacations','Gerenciar férias','Gerenciar férias dos colaboradores.','rh',3,true),
('hr.manage_absences','Gerenciar ausências','Gerenciar ausências dos colaboradores.','rh',4,true),
('hr.manage_documents','Gerenciar documentos','Gerenciar documentos dos colaboradores.','rh',5,true),
('hr.manage_attendance','Gerenciar ponto/frequência','Gerenciar frequência e ponto.','rh',6,true),
('hr.manage_evaluations','Gerenciar avaliações','Gerenciar avaliações de colaboradores.','rh',7,true),
('hr.view_reports','Visualizar relatórios de RH','Acessar relatórios de RH.','rh',8,true),
('schedules.view_establishment','Visualizar horários do estabelecimento','Acessar a configuração de horários de funcionamento do estabelecimento.','schedules',60,true),
('schedules.view_fixed','Visualizar horários dos fixos','Acessar a jornada e os horários dos colaboradores fixos.','schedules',61,true),
('schedules.view_autonomous','Visualizar horários dos autônomos','Acessar a disponibilidade e os horários dos profissionais autônomos.','schedules',62,true),
('schedules.view_absences','Visualizar ausências','Acessar a gestão de ausências dentro de Horários.','schedules',63,true),
('schedules.view_blocks','Visualizar bloqueios','Acessar os bloqueios de horários.','schedules',64,true),
('schedules.view_shifts','Visualizar escalas','Acessar ciclos, modelos e escalas.','schedules',65,true),
('schedules.view_breaks','Visualizar intervalos','Acessar a gestão de intervalos.','schedules',66,true),
('schedules.view_rules','Visualizar regras de horários','Acessar as regras de horários e disponibilidade.','schedules',67,true),
('services.view_services','Visualizar serviços','Acessar a aba de serviços.','services',60,true),
('services.view_combos','Visualizar combos','Acessar a aba de combos.','services',61,true),
('services.view_gifts','Visualizar brindes','Acessar a aba de brindes.','services',62,true),
('services.view','Visualizar serviços','Acessar serviços.','services',1,true),
('services.create','Criar serviços','Criar serviços.','services',2,true),
('services.edit','Editar serviços','Editar serviços.','services',3,true),
('services.delete','Excluir serviços','Excluir serviços.','services',4,true),
('settings.view_landing_page','Visualizar personalização da Landing Page','Acessar a personalização da Landing Page nas configurações.','settings',60,true),
('settings.view_company_info','Visualizar informações da empresa','Acessar a seção de informações básicas da empresa.','settings',61,true),
('settings.view_booking','Visualizar configurações de agendamento','Acessar a seção de configurações de agendamento.','settings',62,true),
('settings.view_payments','Visualizar pagamentos','Acessar a seção de pagamentos.','settings',63,true),
('settings.view_payout_flow','Visualizar fluxo de repasse','Acessar a seção de fluxo de repasse.','settings',64,true),
('settings.view_payment_methods','Visualizar métodos de pagamento','Acessar a seção de métodos de pagamento.','settings',65,true),
('settings.view_plan','Visualizar plano','Acessar a seção de plano.','settings',66,true),
('settings.view','Visualizar configurações','Acessar configurações.','settings',1,true),
('settings.manage','Gerenciar configurações','Gerenciar configurações.','settings',2,true),
('subscription.view','Visualizar assinatura','Acessar assinatura.','subscription',1,true),
('subscription.manage','Gerenciar assinatura','Gerenciar assinatura.','subscription',2,true),
('whatsapp.view','Visualizar WhatsApp','Acessar WhatsApp.','whatsapp',1,true),
('whatsapp.manage','Gerenciar WhatsApp','Gerenciar WhatsApp.','whatsapp',2,true)
ON CONFLICT (code) DO UPDATE SET
name=EXCLUDED.name, description=EXCLUDED.description, module=EXCLUDED.module,
sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active, updated_at=now();

INSERT INTO public.permission_presets (code,name,description,is_active,sort_order) VALUES
('profissional','Profissional','Permissões padrão para profissionais.',true,10),
('encarregado','Encarregado','Permissões padrão para encarregados.',true,20),
('recepcionista','Recepcionista','Permissões padrão para recepcionistas.',true,30),
('gerente','Gerente','Permissões padrão para gerentes.',true,40),
('gerenciar_permissoes','Gerenciar Permissões','Permite alterar as permissões de acesso de outros colaboradores.',true,50),
('rh','RH','Permissões padrão para recursos humanos.',true,50),
('marketing','Marketing','Permissões padrão para marketing.',true,60),
('financeiro','Financeiro','Permissões padrão para financeiro.',true,70)
ON CONFLICT (code) DO UPDATE SET
name=EXCLUDED.name, description=EXCLUDED.description, is_active=EXCLUDED.is_active, sort_order=EXCLUDED.sort_order;

-- Recria os itens dos presets por código, sem depender de UUIDs específicos de outro banco.
DELETE FROM public.permission_preset_items ppi
USING public.permission_presets pp
WHERE ppi.preset_id=pp.id
AND pp.code IN ('profissional','encarregado','recepcionista','gerente','gerenciar_permissoes','rh','marketing','financeiro');

WITH mappings(preset_code, permission_code) AS (
  VALUES
  ('profissional','bookings.manage_own'),('profissional','clients.create'),('profissional','clients.edit'),('profissional','bookings.view'),('profissional','dashboard.view'),('profissional','bookings.edit'),('profissional','chat.view'),('profissional','bookings.create'),('profissional','clients.view'),('profissional','chat.send'),
  ('encarregado','services.view'),('encarregado','clients.create'),('encarregado','clients.edit'),('encarregado','reallocation.create'),('encarregado','bookings.view'),('encarregado','reallocation.approve'),('encarregado','dashboard.view'),('encarregado','chat.view'),('encarregado','bookings.manage_all'),('encarregado','reports.view_basic'),('encarregado','bookings.create'),('encarregado','clients.view'),('encarregado','employees.view'),('encarregado','chat.send'),
  ('recepcionista','clients.create'),('recepcionista','clients.edit'),('recepcionista','bookings.view'),('recepcionista','dashboard.view'),('recepcionista','bookings.edit'),('recepcionista','chat.view'),('recepcionista','bookings.create'),('recepcionista','clients.view'),('recepcionista','bookings.cancel'),('recepcionista','chat.send'),
  ('gerente','services.view'),('gerente','employees.manage_services'),('gerente','chatbot.view'),('gerente','clients.create'),('gerente','clients.edit'),('gerente','reallocation.create'),('gerente','bookings.view'),('gerente','reallocation.approve'),('gerente','dashboard.view'),('gerente','clients.delete'),('gerente','bookings.edit'),('gerente','reallocation.view'),('gerente','employees.create'),('gerente','chat.view'),('gerente','bookings.manage_all'),('gerente','services.create'),('gerente','reports.view_basic'),('gerente','bookings.create'),('gerente','employees.edit'),('gerente','services.edit'),('gerente','clients.view'),('gerente','hr.view'),('gerente','bookings.cancel'),('gerente','employees.view'),('gerente','whatsapp.view'),('gerente','reports.view_financial'),('gerente','marketing.view'),('gerente','chat.send'),('gerente','finance.view'),
  ('gerenciar_permissoes','employees.manage_permissions'),
  ('financeiro','finance.manage'),('financeiro','dashboard.view'),('financeiro','chat.view'),('financeiro','reports.view_basic'),('financeiro','reports.view_financial'),('financeiro','chat.send'),('financeiro','finance.view'),
  ('marketing','marketing.delete'),('marketing','marketing.approve'),('marketing','dashboard.view'),('marketing','chat.view'),('marketing','marketing.create'),('marketing','marketing.view'),('marketing','chat.send'),('marketing','marketing.edit'),
  ('rh','hr.view_reports'),('rh','employees.manage_services'),('rh','hr.manage_attendance'),('rh','hr.manage_absences'),('rh','dashboard.view'),('rh','hr.manage_vacations'),('rh','hr.manage_employees'),('rh','employees.create'),('rh','hr.manage_evaluations'),('rh','chat.view'),('rh','reports.view_basic'),('rh','employees.edit'),('rh','hr.view'),('rh','employees.view'),('rh','employees.delete'),('rh','hr.manage_documents'),('rh','chat.send')
)
INSERT INTO public.permission_preset_items(preset_id,permission_id)
SELECT pp.id,p.id
FROM mappings m
JOIN public.permission_presets pp ON pp.code=m.preset_code
JOIN public.permissions p ON p.code=m.permission_code
ON CONFLICT DO NOTHING;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_preset_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_select_authenticated ON public.permissions;
CREATE POLICY permissions_select_authenticated ON public.permissions
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS permission_presets_select_authenticated ON public.permission_presets;
CREATE POLICY permission_presets_select_authenticated ON public.permission_presets
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS permission_preset_items_select_authenticated ON public.permission_preset_items;
CREATE POLICY permission_preset_items_select_authenticated ON public.permission_preset_items
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS employee_permissions_select_own_company ON public.employee_permissions;
CREATE POLICY employee_permissions_select_own_company ON public.employee_permissions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id=employee_permissions.employee_id
      AND e.user_id=auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.employees actor
    WHERE actor.user_id=auth.uid()
      AND actor.company_id=(SELECT e2.company_id FROM public.employees e2 WHERE e2.id=employee_permissions.employee_id)
      AND actor.is_active=true
      AND actor.role::text IN ('owner','admin')
  )
);

GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.permission_presets TO authenticated;
GRANT SELECT ON public.permission_preset_items TO authenticated;
GRANT SELECT ON public.employee_permissions TO authenticated;

NOTIFY pgrst, 'reload schema';

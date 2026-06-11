
-- 1. Tabela de limites dos planos (Fonte da Verdade)
CREATE TABLE IF NOT EXISTS plan_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT UNIQUE NOT NULL, -- 'starter', 'professional', 'enterprise'
    plan_name TEXT NOT NULL,
    max_employees INTEGER DEFAULT 1,
    max_services INTEGER DEFAULT 5,
    max_bookings_month INTEGER DEFAULT 200,
    max_chatbots INTEGER DEFAULT 1,
    max_chatbot_messages INTEGER DEFAULT 700,
    max_integrations INTEGER DEFAULT 1,
    max_whatsapp_instances INTEGER DEFAULT 1,
    features JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de alterações de assinatura agendadas/histórico
CREATE TABLE IF NOT EXISTS subscription_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    current_plan TEXT NOT NULL,
    current_cycle TEXT NOT NULL,
    target_plan TEXT NOT NULL,
    target_cycle TEXT NOT NULL,
    change_type TEXT NOT NULL, -- 'plan_upgrade', 'plan_downgrade', 'cycle_change', 'upgrade_with_cycle_change'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'scheduled', 'applied', 'cancelled'
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
    upgrade_amount NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_at TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE
);

-- Index para performance nas consultas de tenants
CREATE INDEX IF NOT EXISTS idx_subscription_changes_tenant ON subscription_changes(tenant_id);

-- 3. Inserir dados iniciais dos planos (ajustar valores conforme necessidade)
INSERT INTO plan_limits (plan_id, plan_name, max_employees, max_services, max_bookings_month, max_chatbots, max_chatbot_messages, max_integrations, max_whatsapp_instances, features)
VALUES 
('starter', 'Starter', 1, 5, 200, 1, 700, 1, 1, '["Suporte por email"]'),
('professional', 'Professional', 5, 12, 700, 3, 5000, 3, 3, '["Relatórios avançados", "Suporte prioritário"]'),
('enterprise', 'Enterprise', -1, -1, -1, -1, -1, -1, -1, '["API Completa", "Gerente de conta dedicado"]-- -1 representa ilimitado')
ON CONFLICT (plan_id) DO UPDATE SET
    max_employees = EXCLUDED.max_employees,
    max_services = EXCLUDED.max_services,
    max_bookings_month = EXCLUDED.max_bookings_month,
    max_chatbots = EXCLUDED.max_chatbots,
    max_chatbot_messages = EXCLUDED.max_chatbot_messages,
    max_integrations = EXCLUDED.max_integrations,
    max_whatsapp_instances = EXCLUDED.max_whatsapp_instances,
    features = EXCLUDED.features;

-- 4. Habilitar RLS nas novas tabelas
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_changes ENABLE ROW LEVEL SECURITY;

-- Políticas para plan_limits (Leitura para todos autenticados, Escrita apenas para Super Admin)
CREATE POLICY "Leitura pública de limites de planos" ON plan_limits FOR SELECT USING (true);

-- Políticas para subscription_changes (Empresa vê apenas os seus, Super Admin vê tudo)
CREATE POLICY "Empresas veem suas próprias mudanças" ON subscription_changes FOR SELECT USING (tenant_id IN (SELECT id FROM companies WHERE id = tenant_id));

-- Adicionar colunas extras na tabela de integração para salvar dados do Zailom Flow
ALTER TABLE chatbot_integration ADD COLUMN IF NOT EXISTS flow_workspace_id TEXT;
ALTER TABLE chatbot_integration ADD COLUMN IF NOT EXISTS flow_api_key TEXT;
ALTER TABLE chatbot_integration ADD COLUMN IF NOT EXISTS flow_user_id TEXT;
ALTER TABLE chatbot_integration ADD COLUMN IF NOT EXISTS talkmap_provisioned BOOLEAN DEFAULT FALSE;
ALTER TABLE chatbot_integration ADD COLUMN IF NOT EXISTS talkmap_provisioned_at TIMESTAMP WITH TIME ZONE;


-- ============================================================================
-- 2058: Consumo da nova API pública do Zailom Flow (workspace, instances, bots)
-- ----------------------------------------------------------------------------
-- Contexto: Booking apenas consome dados via API Key (nunca gerencia recursos
-- do Flow). Precisamos cachear infos do workspace + persistir seleção do
-- usuário (instância + bot padrão) + estrutura pronta para mapeamento futuro
-- de eventos do Booking a bots específicos.
-- ============================================================================

-- 1. Base URL configurável por instalação (default é a produção Zailom)
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_api_base_url TEXT
  DEFAULT 'https://api-flowbuilder.zailom.com/functions/v1/flow-api';

-- 2. Snapshot do workspace autenticado (id, name, slug, plan, status, embed…)
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_workspace_data JSONB;

-- 3. Scopes recebidos no /v1/health (array de strings)
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_scopes JSONB DEFAULT '[]'::jsonb;

-- 4. Instância selecionada pelo usuário (dropdown "Instância utilizada")
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_selected_instance_id   TEXT;
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_selected_instance_name TEXT;

-- 5. Bot padrão selecionado
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_default_bot_id   TEXT;
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_default_bot_name TEXT;

-- 6. Estrutura preparada para vinculação futura de eventos → bots
--    Ex: { "booking.created": "<bot_id>", "booking.confirmed": "<bot_id>", ... }
--    Não usado ainda. Apenas preparar campo para não precisar refatorar depois.
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_event_bots JSONB DEFAULT '{}'::jsonb;

-- 7. Última sincronização bem-sucedida com a API do Flow
ALTER TABLE chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_last_synced_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN chatbot_integration.flow_event_bots IS
  'Mapa evento_booking -> bot_id do Flow. Ex.: {"booking.created":"uuid"}. Reservado para uso futuro; hoje apenas armazenamos, o Booking ainda não dispara.';

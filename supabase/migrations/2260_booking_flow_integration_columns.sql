-- 2260: Persistência completa do vínculo Booking ↔ Zailom Flow
-- Alinha chatbot_integration aos campos gravados por provision-zailom-flow.
-- Idempotente para bancos que já tenham parte dessas colunas.

ALTER TABLE public.chatbot_integration
  ADD COLUMN IF NOT EXISTS flow_user_id TEXT,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS external_plan_reference TEXT,
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chatbot_integration.flow_user_id IS
  'ID do usuário proprietário criado/sincronizado no Zailom Flow.';
COMMENT ON COLUMN public.chatbot_integration.external_account_id IS
  'ID da conta externa vinculada ao Booking (usuário proprietário do Flow).';
COMMENT ON COLUMN public.chatbot_integration.external_plan_reference IS
  'Tier do plano provisionado no Flow: starter, pro ou business.';
COMMENT ON COLUMN public.chatbot_integration.sync_status IS
  'Estado da sincronização Booking ↔ Flow.';
COMMENT ON COLUMN public.chatbot_integration.last_synced_at IS
  'Data/hora da última sincronização bem-sucedida com o Flow.';

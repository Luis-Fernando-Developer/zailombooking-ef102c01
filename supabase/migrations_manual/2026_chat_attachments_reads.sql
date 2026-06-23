-- =====================================================================
-- 2026_chat_attachments_reads.sql
-- Adiciona:
--  1) Colunas de anexo (imagem/áudio/arquivo) em chat_messages
--  2) Tabela chat_reads para indicar mensagens lidas por usuário/conversa
--  3) Bucket de Storage 'chat-attachments' (privado) + policies
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Anexos em chat_messages
-- ---------------------------------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  TEXT
    CHECK (attachment_type IS NULL OR attachment_type IN ('image','audio','file')),
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT;

-- Permitir mensagens só com anexo (sem texto). Recriar CHECK de content.
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_content_check;

ALTER TABLE public.chat_messages
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_content_or_attachment_check
  CHECK (
    (content IS NOT NULL AND length(trim(content)) > 0)
    OR attachment_url IS NOT NULL
  );

-- ---------------------------------------------------------------------
-- 2) chat_reads — última leitura por usuário em cada "thread"
--    thread_key: 'general' para o canal geral; '<peer_user_id>' para DM.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_reads (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  thread_key  TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id, thread_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_reads TO authenticated;
GRANT ALL ON public.chat_reads TO service_role;

ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_reads_select_own" ON public.chat_reads;
CREATE POLICY "chat_reads_select_own" ON public.chat_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_reads_upsert_own" ON public.chat_reads;
CREATE POLICY "chat_reads_upsert_own" ON public.chat_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.user_can_chat(auth.uid(), company_id));

DROP POLICY IF EXISTS "chat_reads_update_own" ON public.chat_reads;
CREATE POLICY "chat_reads_update_own" ON public.chat_reads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3) Bucket de anexos (privado, signed URLs)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: usuário só pode ler/escrever objetos dentro de um "prefix" da empresa
-- que ele tem permissão de chat. Path: <company_id>/<user_id>/<uuid>.<ext>

DROP POLICY IF EXISTS "chat_attach_select" ON storage.objects;
CREATE POLICY "chat_attach_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.user_can_chat(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "chat_attach_insert" ON storage.objects;
CREATE POLICY "chat_attach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND public.user_can_chat(auth.uid(), (split_part(name, '/', 1))::uuid)
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat_attach_delete_own" ON storage.objects;
CREATE POLICY "chat_attach_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';

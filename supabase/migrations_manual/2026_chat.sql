-- =====================================================================
-- 2026_chat.sql
-- Bate-papo interno entre colaboradores
--
-- Acesso restrito a colaboradores com role em:
--   owner, manager, supervisor, rh, marketing
--
-- Canais:
--   - 'general' : chat geral da empresa (todos os habilitados leem/escrevem)
--   - 'direct'  : conversa particular entre dois usuários (sender/recipient)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Garantir valores necessários no enum employee_role
--    IMPORTANTE: ALTER TYPE ADD VALUE precisa ser commitado ANTES
--    de ser usado. Execute este bloco SEPARADAMENTE primeiro, depois
--    rode o restante do arquivo.
-- ---------------------------------------------------------------------
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'rh';
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'marketing';
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'supervisor';

COMMIT;
BEGIN;

-- ---------------------------------------------------------------------
-- 1) Helper: usuário pode usar o chat na empresa?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_chat(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = _company_id
      AND lower(c.owner_email) = lower(COALESCE((SELECT email FROM auth.users WHERE id = _user_id), ''))
  )
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = _user_id
      AND e.company_id = _company_id
      AND e.role IN ('owner','manager','supervisor','rh','marketing')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_chat(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Tabela de mensagens
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_type     TEXT NOT NULL CHECK (channel_type IN ('general','direct')),
  sender_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content          TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (channel_type = 'general' AND recipient_user_id IS NULL)
    OR (channel_type = 'direct' AND recipient_user_id IS NOT NULL AND recipient_user_id <> sender_user_id)
  )
);

CREATE INDEX IF NOT EXISTS idx_chat_msgs_company_channel_created
  ON public.chat_messages (company_id, channel_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_msgs_dm_pair
  ON public.chat_messages (company_id, sender_user_id, recipient_user_id, created_at DESC)
  WHERE channel_type = 'direct';

GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: pode ler se pertence/é owner da empresa E é geral OU é parte da DM
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    public.user_can_chat(auth.uid(), company_id)
    AND (
      channel_type = 'general'
      OR sender_user_id = auth.uid()
      OR recipient_user_id = auth.uid()
    )
  );

-- INSERT: precisa ser o próprio sender e habilitado; em DM, recipient também habilitado
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.user_can_chat(auth.uid(), company_id)
    AND (
      channel_type = 'general'
      OR (
        channel_type = 'direct'
        AND recipient_user_id IS NOT NULL
        AND public.user_can_chat(recipient_user_id, company_id)
      )
    )
  );

-- ---------------------------------------------------------------------
-- 3) Realtime
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
  END IF;
END$$;

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';

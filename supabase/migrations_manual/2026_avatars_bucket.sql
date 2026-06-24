-- =====================================================================
-- 2026_avatars_bucket.sql
-- Cria bucket "avatars" para fotos de perfil dos colaboradores.
-- Público para leitura, gravação restrita ao próprio usuário.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Leitura pública
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Upload apenas se o caminho começa com o uid do usuário (ex: <uid>/file.png)
DROP POLICY IF EXISTS "avatars_user_insert" ON storage.objects;
CREATE POLICY "avatars_user_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
CREATE POLICY "avatars_user_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;
CREATE POLICY "avatars_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

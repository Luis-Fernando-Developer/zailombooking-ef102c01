-- =====================================================================
-- PRÉ-REQUISITO: Tabela user_roles
-- Execute ESTE arquivo ANTES de 2026_feature_registry.sql
-- =====================================================================
-- Cria o enum app_role, a tabela user_roles e a função has_role.
-- Segue o padrão recomendado (roles em tabela separada, security definer).
-- Idempotente: pode ser executado múltiplas vezes sem erro.
-- =====================================================================

-- 1) Enum de roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'moderator', 'user');
  END IF;
END$$;

-- Caso o enum já exista sem 'super_admin', adiciona o valor
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2) Tabela user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role    ON public.user_roles(role);

-- 3) GRANTS (Data API)
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

-- 4) RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 5) Função has_role (security definer evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 6) Policy adicional: super_admin gerencia todas as roles
DROP POLICY IF EXISTS "Super admins manage all roles" ON public.user_roles;
CREATE POLICY "Super admins manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- =====================================================================
-- COMO PROMOVER O PRIMEIRO SUPER ADMIN
-- Substitua <SEU_USER_ID> pelo UUID do usuário em auth.users:
--
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<SEU_USER_ID>', 'super_admin')
--   ON CONFLICT (user_id, role) DO NOTHING;
--
-- Para descobrir seu UUID:
--   SELECT id, email FROM auth.users WHERE email = 'seu@email.com';
-- =====================================================================

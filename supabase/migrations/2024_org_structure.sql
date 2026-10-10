-- =====================================================================
-- 2026_org_structure.sql
-- Reestruturação organizacional (Etapa 1 do ERP)
--
-- Esta migration APENAS cria a estrutura de dados. Não implementa:
--   permissões, hierarquia, escalas, ponto, aprovações.
--
-- Camadas:
--   1) company_segment + company_niche (catálogo + campos em companies)
--   2) system_profiles      → perfil de sistema (futuro: permissões)
--   3) base_occupations     → ocupação base (catálogo global + por empresa)
--   4) internal_job_title   → cargo interno (texto livre por colaborador)
--
-- Aplicação: rodar uma vez no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) SEGMENTO E NICHO DA EMPRESA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_segments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_niches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES public.company_segments(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (segment_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_company_niches_segment ON public.company_niches(segment_id);

GRANT SELECT ON public.company_segments TO anon, authenticated;
GRANT SELECT ON public.company_niches   TO anon, authenticated;
GRANT ALL    ON public.company_segments TO service_role;
GRANT ALL    ON public.company_niches   TO service_role;

ALTER TABLE public.company_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_niches   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "segments_public_read" ON public.company_segments;
CREATE POLICY "segments_public_read" ON public.company_segments
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "niches_public_read" ON public.company_niches;
CREATE POLICY "niches_public_read" ON public.company_niches
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- Campos na tabela companies (slugs livres p/ não acoplar fortemente)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_segment TEXT,
  ADD COLUMN IF NOT EXISTS company_niche   TEXT;

-- Seed inicial -------------------------------------------------------
INSERT INTO public.company_segments (slug, name, sort_order) VALUES
  ('beleza_estetica',  'Beleza e Estética',     1),
  ('saude',            'Saúde',                 2),
  ('consultoria',      'Consultoria',           3),
  ('petshop_vet',      'Pet Shop e Veterinária',4),
  ('servicos_tecnicos','Serviços Técnicos',     5),
  ('educacao',         'Educação',              6),
  ('outro',            'Outro',                 99)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.company_niches (segment_id, slug, name, sort_order)
SELECT s.id, v.slug, v.name, v.sort_order
FROM (VALUES
  ('beleza_estetica','barbearia',           'Barbearia',             1),
  ('beleza_estetica','salao_beleza',        'Salão de Beleza',       2),
  ('beleza_estetica','clinica_estetica',    'Clínica de Estética',   3),
  ('beleza_estetica','spa',                 'Spa',                   4),
  ('beleza_estetica','sobrancelhas',        'Estúdio de Sobrancelhas',5),
  ('beleza_estetica','outro',               'Outro',                 99),

  ('saude','clinica_medica',     'Clínica Médica',     1),
  ('saude','consultorio_medico', 'Consultório Médico', 2),
  ('saude','odontologia',        'Odontologia',        3),
  ('saude','psicologia',         'Psicologia',         4),
  ('saude','nutricao',           'Nutrição',           5),
  ('saude','fisioterapia',       'Fisioterapia',       6),
  ('saude','outro',              'Outro',              99),

  ('consultoria','advocacia',              'Advocacia',              1),
  ('consultoria','contabilidade',          'Contabilidade',          2),
  ('consultoria','consultoria_empresarial','Consultoria Empresarial',3),
  ('consultoria','mentoria',               'Mentoria',               4),
  ('consultoria','outro',                  'Outro',                  99),

  ('petshop_vet','petshop',     'Pet Shop',     1),
  ('petshop_vet','veterinaria', 'Veterinária',  2),
  ('petshop_vet','banho_tosa',  'Banho e Tosa', 3),
  ('petshop_vet','outro',       'Outro',       99),

  ('servicos_tecnicos','assistencia_tecnica','Assistência Técnica',1),
  ('servicos_tecnicos','manutencao',         'Manutenção',         2),
  ('servicos_tecnicos','outro',              'Outro',             99),

  ('educacao','escola_idiomas','Escola de Idiomas',1),
  ('educacao','reforco',       'Reforço Escolar',  2),
  ('educacao','musica',        'Escola de Música', 3),
  ('educacao','outro',         'Outro',           99),

  ('outro','outro','Outro',1)
) AS v(segment_slug, slug, name, sort_order)
JOIN public.company_segments s ON s.slug = v.segment_slug
ON CONFLICT (segment_id, slug) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2) PERFIL DO SISTEMA (system_profiles) — base p/ permissões futuras
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,   -- ex: 'OWNER', 'GERENTE'
  name        TEXT NOT NULL,          -- label exibido
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_profiles TO anon, authenticated;
GRANT ALL    ON public.system_profiles TO service_role;

ALTER TABLE public.system_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_profiles_read" ON public.system_profiles;
CREATE POLICY "system_profiles_read" ON public.system_profiles
  FOR SELECT TO anon, authenticated USING (is_active = true);

INSERT INTO public.system_profiles (code, name, sort_order) VALUES
  ('OWNER',           'Owner',           1),
  ('GERENTE',         'Gerente',         2),
  ('RH',              'RH',              3),
  ('FINANCEIRO',      'Financeiro',      4),
  ('MARKETING',       'Marketing',       5),
  ('ENCARREGADO',     'Encarregado',     6),
  ('RECEPCIONISTA',   'Recepcionista',   7),
  ('PROFISSIONAL',    'Profissional',    8),
  ('FAXINEIRO',       'Faxineiro',       9),
  ('SEGURANCA',       'Segurança',      10),
  ('FISCAL',          'Fiscal',         11),
  ('DESIGNER_GRAFICO','Designer Gráfico',12)
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------
-- 3) OCUPAÇÃO BASE (base_occupations)
--    company_id NULL = ocupação global (sugestão do sistema)
--    company_id != NULL = ocupação personalizada da empresa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.base_occupations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_base_occupations_company ON public.base_occupations(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_base_occupations_global_name
  ON public.base_occupations (lower(name)) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_base_occupations_company_name
  ON public.base_occupations (company_id, lower(name)) WHERE company_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.base_occupations TO authenticated;
GRANT ALL ON public.base_occupations TO service_role;

ALTER TABLE public.base_occupations ENABLE ROW LEVEL SECURITY;

-- leitura: globais (company_id IS NULL) são visíveis a todos os autenticados
-- + ocupações da própria empresa do usuário
DROP POLICY IF EXISTS "occupations_read" ON public.base_occupations;
CREATE POLICY "occupations_read" ON public.base_occupations
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND e.company_id = base_occupations.company_id
    )
    OR public.user_belongs_to_company(auth.uid(), base_occupations.company_id)
  );

-- escrita: usuários da empresa podem criar/editar/remover ocupações próprias
-- (refinamento por perfil virá depois)
DROP POLICY IF EXISTS "occupations_write" ON public.base_occupations;
CREATE POLICY "occupations_write" ON public.base_occupations
  FOR ALL TO authenticated
  USING (
    company_id IS NOT NULL
    AND public.user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );


-- Seed global de ocupações sugeridas
INSERT INTO public.base_occupations (company_id, name) VALUES
  (NULL,'Barbeiro'),
  (NULL,'Cabeleireiro'),
  (NULL,'Manicure'),
  (NULL,'Pedicure'),
  (NULL,'Designer de Sobrancelhas'),
  (NULL,'Esteticista'),
  (NULL,'Massoterapeuta'),
  (NULL,'Recepcionista'),
  (NULL,'Secretária'),
  (NULL,'Auxiliar Administrativo'),
  (NULL,'Auxiliar de Limpeza'),
  (NULL,'Gerente Administrativo'),
  (NULL,'Analista de RH'),
  (NULL,'Médico'),
  (NULL,'Dentista'),
  (NULL,'Psicólogo'),
  (NULL,'Nutricionista'),
  (NULL,'Fisioterapeuta'),
  (NULL,'Advogado'),
  (NULL,'Contador'),
  (NULL,'Consultor'),
  (NULL,'Mentor'),
  (NULL,'Veterinário'),
  (NULL,'Banhista/Tosador'),
  (NULL,'Técnico de Manutenção'),
  (NULL,'Professor')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------
-- 4) COLABORADOR — novos vínculos
-- ---------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS system_profile_id   UUID REFERENCES public.system_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS base_occupation_id  UUID REFERENCES public.base_occupations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_job_title  TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_system_profile  ON public.employees(system_profile_id);
CREATE INDEX IF NOT EXISTS idx_employees_base_occupation ON public.employees(base_occupation_id);

-- ---------------------------------------------------------------------
-- Recarregar schema do PostgREST
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- Corrige o catálogo público de segmentos e nichos usado na contratação pela landing page.
-- Idempotente: preserva os registros existentes e completa apenas os que estiverem ausentes.

CREATE TABLE IF NOT EXISTS public.company_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_niches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES public.company_segments(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (segment_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_company_niches_segment ON public.company_niches(segment_id);

GRANT SELECT ON public.company_segments TO anon, authenticated;
GRANT SELECT ON public.company_niches TO anon, authenticated;
GRANT ALL ON public.company_segments TO service_role;
GRANT ALL ON public.company_niches TO service_role;

ALTER TABLE public.company_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_niches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "segments_public_read" ON public.company_segments;
CREATE POLICY "segments_public_read" ON public.company_segments
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "niches_public_read" ON public.company_niches;
CREATE POLICY "niches_public_read" ON public.company_niches
  FOR SELECT TO anon, authenticated USING (is_active = true);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_segment TEXT,
  ADD COLUMN IF NOT EXISTS company_niche TEXT;

INSERT INTO public.company_segments (slug, name, sort_order) VALUES
  ('beleza_estetica', 'Beleza e Estética', 1),
  ('saude', 'Saúde', 2),
  ('consultoria', 'Consultoria', 3),
  ('petshop_vet', 'Pet Shop e Veterinária', 4),
  ('servicos_tecnicos', 'Serviços Técnicos', 5),
  ('educacao', 'Educação', 6),
  ('outro', 'Outro', 99)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

INSERT INTO public.company_niches (segment_id, slug, name, sort_order)
SELECT s.id, v.slug, v.name, v.sort_order
FROM (VALUES
  ('beleza_estetica','barbearia','Barbearia',1),
  ('beleza_estetica','salao_beleza','Salão de Beleza',2),
  ('beleza_estetica','clinica_estetica','Clínica de Estética',3),
  ('beleza_estetica','spa','Spa',4),
  ('beleza_estetica','sobrancelhas','Estúdio de Sobrancelhas',5),
  ('beleza_estetica','outro','Outro',99),
  ('saude','clinica_medica','Clínica Médica',1),
  ('saude','consultorio_medico','Consultório Médico',2),
  ('saude','odontologia','Odontologia',3),
  ('saude','psicologia','Psicologia',4),
  ('saude','nutricao','Nutrição',5),
  ('saude','fisioterapia','Fisioterapia',6),
  ('saude','outro','Outro',99),
  ('consultoria','advocacia','Advocacia',1),
  ('consultoria','contabilidade','Contabilidade',2),
  ('consultoria','consultoria_empresarial','Consultoria Empresarial',3),
  ('consultoria','mentoria','Mentoria',4),
  ('consultoria','outro','Outro',99),
  ('petshop_vet','petshop','Pet Shop',1),
  ('petshop_vet','veterinaria','Veterinária',2),
  ('petshop_vet','banho_tosa','Banho e Tosa',3),
  ('petshop_vet','outro','Outro',99),
  ('servicos_tecnicos','assistencia_tecnica','Assistência Técnica',1),
  ('servicos_tecnicos','manutencao','Manutenção',2),
  ('servicos_tecnicos','outro','Outro',99),
  ('educacao','escola_idiomas','Escola de Idiomas',1),
  ('educacao','reforco','Reforço Escolar',2),
  ('educacao','musica','Escola de Música',3),
  ('educacao','outro','Outro',99),
  ('outro','outro','Outro',1)
) AS v(segment_slug, slug, name, sort_order)
JOIN public.company_segments s ON s.slug = v.segment_slug
ON CONFLICT (segment_id, slug) DO UPDATE
SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';

-- Permite leitura pública (anon) dos materiais aprovados,
-- necessário para o embed marketing_materials(*) em campanhas exibidas
-- na landing page para visitantes não autenticados.
DROP POLICY IF EXISTS mkt_mat_view_anon ON public.marketing_materials;
CREATE POLICY mkt_mat_view_anon ON public.marketing_materials
  FOR SELECT TO anon
  USING (status = 'approved' AND deleted_at IS NULL);

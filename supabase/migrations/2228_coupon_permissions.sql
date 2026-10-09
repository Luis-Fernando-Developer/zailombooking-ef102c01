-- Permissões granulares do módulo Cupons Promocionais.
-- Mantém os cupons de aquisição da plataforma separados dos cupons das empresas.
BEGIN;

INSERT INTO public.permissions (code, name, description, module, sort_order, is_active)
VALUES
  ('coupons.view', 'Visualizar cupons promocionais', 'Ver a lista de cupons promocionais cadastrados.', 'coupons', 1, true),
  ('coupons.create', 'Criar cupons promocionais', 'Cadastrar novos cupons promocionais para clientes.', 'coupons', 2, true),
  ('coupons.edit', 'Editar cupons promocionais', 'Alterar regras, validade, escopo e status dos cupons.', 'coupons', 3, true),
  ('coupons.delete', 'Excluir cupons promocionais', 'Excluir cupons promocionais ainda não utilizados.', 'coupons', 4, true),
  ('coupons.view_usage', 'Visualizar utilização dos cupons', 'Ver quantidade de utilizações e usos restantes de cada cupom.', 'coupons', 5, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

-- Gerentes recebem o conjunto completo por padrão. Os demais presets só recebem
-- permissões de cupons quando forem selecionadas manualmente no colaborador.
INSERT INTO public.permission_preset_items (preset_id, permission_id)
SELECT pp.id, p.id
FROM public.permission_presets pp
CROSS JOIN public.permissions p
WHERE pp.code = 'gerente'
  AND p.code IN ('coupons.view', 'coupons.create', 'coupons.edit', 'coupons.delete', 'coupons.view_usage')
ON CONFLICT DO NOTHING;

-- Substitui a regra ampla settings.manage por permissões específicas do módulo.
DROP POLICY IF EXISTS company_service_coupons_company_manage ON public.company_service_coupons;
DROP POLICY IF EXISTS company_service_coupons_company_select ON public.company_service_coupons;
DROP POLICY IF EXISTS company_service_coupons_company_insert ON public.company_service_coupons;
DROP POLICY IF EXISTS company_service_coupons_company_update ON public.company_service_coupons;
DROP POLICY IF EXISTS company_service_coupons_company_delete ON public.company_service_coupons;

CREATE POLICY company_service_coupons_company_select
ON public.company_service_coupons FOR SELECT TO authenticated
USING (public.user_has_company_permission(company_id, 'coupons.view'));

CREATE POLICY company_service_coupons_company_insert
ON public.company_service_coupons FOR INSERT TO authenticated
WITH CHECK (public.user_has_company_permission(company_id, 'coupons.create'));

CREATE POLICY company_service_coupons_company_update
ON public.company_service_coupons FOR UPDATE TO authenticated
USING (public.user_has_company_permission(company_id, 'coupons.edit'))
WITH CHECK (public.user_has_company_permission(company_id, 'coupons.edit'));

CREATE POLICY company_service_coupons_company_delete
ON public.company_service_coupons FOR DELETE TO authenticated
USING (public.user_has_company_permission(company_id, 'coupons.delete'));

-- A leitura das contagens é separada da permissão de administrar os cupons.
DROP POLICY IF EXISTS company_service_coupon_redemptions_company_read ON public.company_service_coupon_redemptions;
CREATE POLICY company_service_coupon_redemptions_company_read
ON public.company_service_coupon_redemptions FOR SELECT TO authenticated
USING (public.user_has_company_permission(company_id, 'coupons.view_usage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_service_coupons TO authenticated;
GRANT SELECT ON public.company_service_coupon_redemptions TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

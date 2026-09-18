-- FASE 10.5: remover definitivamente a permissão redundante de Serviços.
--
-- A permissão services.view_services ("Acessar a aba de serviços")
-- duplicava services.view ("Permite visualizar serviços").
-- Como o catálogo de permissões é exibido pela tela de gerenciamento,
-- apenas desativar is_active não é suficiente: a entrada redundante
-- precisa ser removida do catálogo e de seus vínculos.

DELETE FROM public.employee_permissions
WHERE permission_id IN (
  SELECT id
  FROM public.permissions
  WHERE code = 'services.view_services'
);

DELETE FROM public.permissions
WHERE code = 'services.view_services';

NOTIFY pgrst, 'reload schema';

-- FASE 10.5: remover definitivamente a permissão redundante de Serviços.
--
-- A permissão services.view_services ("Acessar a aba de serviços")
-- duplicava services.view ("Permite visualizar serviços").
-- O catálogo precisa remover a entrada e seus vínculos.
--
-- employee_permissions possui um trigger de proteção que depende de
-- auth.uid(). Durante migrations executadas pelo PostgreSQL esse contexto
-- não existe, então o trigger bloquearia a própria migration com
-- "Unauthorized". Desabilitamos o trigger somente durante esta limpeza
-- administrativa e o reativamos imediatamente depois.

ALTER TABLE public.employee_permissions
  DISABLE TRIGGER trg_guard_employee_permission_change;

DELETE FROM public.employee_permissions
WHERE permission_id IN (
  SELECT id
  FROM public.permissions
  WHERE code = 'services.view_services'
);

DELETE FROM public.permissions
WHERE code = 'services.view_services';

ALTER TABLE public.employee_permissions
  ENABLE TRIGGER trg_guard_employee_permission_change;

NOTIFY pgrst, 'reload schema';

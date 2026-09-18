-- FASE 10.5: consolidar a permissão de acesso à aba de Serviços.
--
-- services.view passa a ser a única permissão necessária para visualizar
-- a aba de Serviços. A antiga permissão services.view_services era
-- redundante e fica inativa no catálogo.
-- Combos e Brindes continuam usando permissões próprias de visualização.

UPDATE public.permissions
SET is_active = false
WHERE code = 'services.view_services';

NOTIFY pgrst, 'reload schema';

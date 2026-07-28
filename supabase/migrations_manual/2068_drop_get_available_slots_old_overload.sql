-- ============================================================================
-- 2068 — Remove a assinatura antiga de 4 parâmetros de get_available_slots
--
-- Contexto: a migration 2067 adicionou a variante com p_ignore_min_advance,
-- mas a antiga (4 args) continuou existindo. PostgREST não consegue escolher
-- entre as duas quando o cliente envia p_ignore_min_advance, retornando
-- PGRST203 ("Could not choose the best candidate function"). A solução é
-- manter apenas a assinatura de 5 argumentos (com DEFAULT FALSE), que já
-- cobre todas as chamadas anteriores.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_available_slots(uuid, uuid, uuid, date);

-- Reafirma os privilégios da assinatura vigente (5 args).
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, uuid, date, boolean)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

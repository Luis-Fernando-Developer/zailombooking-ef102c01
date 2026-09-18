-- ============================================================================
-- 2176 - Conquistas de brindes: clientes não alteram registros diretamente
-- ============================================================================

DROP POLICY IF EXISTS client_reward_achievements_update ON public.client_reward_achievements;
REVOKE UPDATE ON public.client_reward_achievements FROM authenticated;

NOTIFY pgrst, 'reload schema';

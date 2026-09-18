-- ============================================================================
-- 2175 - Protege resgate contra serviço/valor fora do brinde
-- ============================================================================

CREATE OR REPLACE FUNCTION public.redeem_client_reward(
  p_achievement_id UUID,
  p_booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement public.client_reward_achievements%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_achievement
  FROM public.client_reward_achievements
  WHERE id = p_achievement_id
    AND status = 'available'
    AND expires_at > now();

  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_booking.client_id IS DISTINCT FROM v_achievement.client_id
     OR v_booking.company_id IS DISTINCT FROM v_achievement.company_id
     OR v_booking.service_id IS NULL
     OR NOT (v_booking.service_id = ANY(v_achievement.reward_service_ids))
     OR COALESCE(v_booking.price, 0) <> COALESCE(v_achievement.reward_value, 0)
     OR NOT EXISTS (
       SELECT 1 FROM public.clients c
       WHERE c.id = v_achievement.client_id
         AND c.user_id = auth.uid()
         AND c.company_id = v_achievement.company_id
     )
  THEN
    RETURN false;
  END IF;

  UPDATE public.client_reward_achievements
  SET status = 'redeemed',
      redeemed_at = now(),
      redeemed_booking_id = p_booking_id
  WHERE id = p_achievement_id
    AND status = 'available'
    AND expires_at > now();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_client_reward(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_client_reward(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

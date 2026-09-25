-- ============================================================================
-- 2172 - Programa de brindes: conquistas, validade, valor e resgate
-- ============================================================================

ALTER TABLE public.client_rewards
  ADD COLUMN IF NOT EXISTS reward_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validity_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.client_rewards
  DROP CONSTRAINT IF EXISTS client_rewards_validity_days_check;
ALTER TABLE public.client_rewards
  ADD CONSTRAINT client_rewards_validity_days_check
  CHECK (validity_days > 0 AND validity_days <= 3650);

ALTER TABLE public.client_rewards
  DROP CONSTRAINT IF EXISTS client_rewards_reward_value_check;
ALTER TABLE public.client_rewards
  ADD CONSTRAINT client_rewards_reward_value_check
  CHECK (reward_value >= 0);

CREATE TABLE IF NOT EXISTS public.client_reward_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.client_rewards(id) ON DELETE CASCADE,
  achievement_number INTEGER NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  redeemed_at TIMESTAMPTZ NULL,
  redeemed_booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  qualifying_booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  reward_name TEXT NOT NULL,
  reward_description TEXT NULL,
  reward_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  reward_service_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  required_procedures INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_reward_achievements_status_check
    CHECK (status IN ('available','redeemed','expired')),
  CONSTRAINT client_reward_achievements_number_check
    CHECK (achievement_number > 0),
  CONSTRAINT client_reward_achievements_value_check
    CHECK (reward_value >= 0),
  UNIQUE (client_id, reward_id, achievement_number)
);

CREATE INDEX IF NOT EXISTS idx_reward_achievements_client
  ON public.client_reward_achievements(client_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_achievements_company
  ON public.client_reward_achievements(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_achievements_expiration
  ON public.client_reward_achievements(status, expires_at);

ALTER TABLE public.client_reward_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_reward_achievements_select ON public.client_reward_achievements;
CREATE POLICY client_reward_achievements_select
ON public.client_reward_achievements
FOR SELECT TO authenticated
USING (
  public.user_is_company_client(auth.uid(), company_id)
  OR public.user_has_company_permission(company_id, 'services.view')
);

DROP POLICY IF EXISTS client_reward_achievements_update ON public.client_reward_achievements;
CREATE POLICY client_reward_achievements_update
ON public.client_reward_achievements
FOR UPDATE TO authenticated
USING (
  public.user_is_company_client(auth.uid(), company_id)
  OR public.user_has_company_permission(company_id, 'services.edit')
)
WITH CHECK (
  public.user_is_company_client(auth.uid(), company_id)
  OR public.user_has_company_permission(company_id, 'services.edit')
);

GRANT SELECT, UPDATE ON public.client_reward_achievements TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_reward_expirations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.client_reward_achievements
  SET status = 'expired'
  WHERE status = 'available'
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_client_rewards_for_completed_booking(p_booking_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_reward RECORD;
  v_client_count INTEGER;
  v_existing INTEGER;
  v_to_award INTEGER;
  v_service_ids UUID[];
  v_next INTEGER;
  v_expiry TIMESTAMPTZ;
  v_inserted INTEGER := 0;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND OR v_booking.booking_status::text <> 'completed' OR v_booking.client_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_reward IN
    SELECT *
    FROM public.client_rewards
    WHERE company_id = v_booking.company_id
      AND is_active = true
      AND required_procedures > 0
  LOOP
    IF v_reward.count_specific_service THEN
      IF v_reward.specific_service_id IS NULL OR v_booking.service_id IS DISTINCT FROM v_reward.specific_service_id THEN
        CONTINUE;
      END IF;

      SELECT count(*) INTO v_client_count
      FROM public.bookings b
      WHERE b.client_id = v_booking.client_id
        AND b.company_id = v_booking.company_id
        AND b.booking_status::text = 'completed'
        AND b.service_id = v_reward.specific_service_id;
    ELSE
      SELECT count(*) INTO v_client_count
      FROM public.bookings b
      WHERE b.client_id = v_booking.client_id
        AND b.company_id = v_booking.company_id
        AND b.booking_status::text = 'completed';
    END IF;

    v_to_award := floor(v_client_count / v_reward.required_procedures)::INTEGER;

    SELECT count(*) INTO v_existing
    FROM public.client_reward_achievements a
    WHERE a.client_id = v_booking.client_id
      AND a.reward_id = v_reward.id;

    WHILE v_existing < v_to_award LOOP
      v_next := v_existing + 1;
      v_expiry := now() + make_interval(days => GREATEST(v_reward.validity_days, 1));

      SELECT COALESCE(array_agg(crs.service_id ORDER BY crs.created_at), '{}'::UUID[])
      INTO v_service_ids
      FROM public.client_reward_services crs
      WHERE crs.reward_id = v_reward.id;

      INSERT INTO public.client_reward_achievements (
        company_id, client_id, reward_id, achievement_number,
        earned_at, expires_at, status,
        qualifying_booking_id,
        reward_name, reward_description, reward_value,
        reward_service_ids, required_procedures
      )
      VALUES (
        v_booking.company_id, v_booking.client_id, v_reward.id, v_next,
        now(), v_expiry, 'available',
        p_booking_id,
        v_reward.name, v_reward.description, COALESCE(v_reward.reward_value, 0),
        COALESCE(v_service_ids, '{}'::UUID[]), v_reward.required_procedures
      )
      ON CONFLICT (client_id, reward_id, achievement_number) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      END IF;
      v_existing := v_existing + 1;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_award_client_rewards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.booking_status::text = 'completed'
     AND COALESCE(OLD.booking_status::text, '') <> 'completed' THEN
    PERFORM public.award_client_rewards_for_completed_booking(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_client_rewards ON public.bookings;
CREATE TRIGGER trg_award_client_rewards
AFTER UPDATE OF booking_status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_award_client_rewards();

CREATE OR REPLACE FUNCTION public.redeem_client_reward(
  p_achievement_id UUID,
  p_booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok BOOLEAN := false;
BEGIN
  UPDATE public.client_reward_achievements a
  SET status = 'redeemed',
      redeemed_at = now(),
      redeemed_booking_id = p_booking_id
  WHERE a.id = p_achievement_id
    AND a.status = 'available'
    AND a.expires_at > now()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = p_booking_id
        AND b.client_id = a.client_id
        AND b.company_id = a.company_id
    )
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = a.client_id
        AND c.user_id = auth.uid()
        AND c.company_id = a.company_id
    );

  v_ok := FOUND;
  RETURN v_ok;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_client_reward(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_client_reward(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.award_client_rewards_for_completed_booking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_client_rewards_for_completed_booking(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_reward_expirations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_reward_expirations() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

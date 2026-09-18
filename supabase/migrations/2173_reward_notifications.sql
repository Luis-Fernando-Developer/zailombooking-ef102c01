-- ============================================================================
-- 2173 - Notificação de brinde conquistado
-- ============================================================================

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
  v_user_id UUID;
  v_service_names TEXT;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR v_booking.booking_status::text <> 'completed' OR v_booking.client_id IS NULL THEN RETURN 0; END IF;

  SELECT user_id INTO v_user_id
  FROM public.clients
  WHERE id = v_booking.client_id AND company_id = v_booking.company_id;

  FOR v_reward IN
    SELECT * FROM public.client_rewards
    WHERE company_id = v_booking.company_id AND is_active = true AND required_procedures > 0
  LOOP
    IF v_reward.count_specific_service THEN
      IF v_reward.specific_service_id IS NULL OR v_booking.service_id IS DISTINCT FROM v_reward.specific_service_id THEN CONTINUE; END IF;
      SELECT count(*) INTO v_client_count FROM public.bookings b
      WHERE b.client_id = v_booking.client_id AND b.company_id = v_booking.company_id
        AND b.booking_status::text = 'completed' AND b.service_id = v_reward.specific_service_id;
    ELSE
      SELECT count(*) INTO v_client_count FROM public.bookings b
      WHERE b.client_id = v_booking.client_id AND b.company_id = v_booking.company_id
        AND b.booking_status::text = 'completed';
    END IF;

    v_to_award := floor(v_client_count / v_reward.required_procedures)::INTEGER;

    SELECT count(*) INTO v_existing FROM public.client_reward_achievements a
    WHERE a.client_id = v_booking.client_id AND a.reward_id = v_reward.id;

    WHILE v_existing < v_to_award LOOP
      v_next := v_existing + 1;
      v_expiry := now() + make_interval(days => GREATEST(v_reward.validity_days, 1));

      SELECT COALESCE(array_agg(crs.service_id ORDER BY crs.created_at), '{}'::UUID[])
      INTO v_service_ids
      FROM public.client_reward_services crs
      WHERE crs.reward_id = v_reward.id;

      INSERT INTO public.client_reward_achievements (
        company_id, client_id, reward_id, achievement_number, earned_at, expires_at,
        status, qualifying_booking_id, reward_name, reward_description, reward_value,
        reward_service_ids, required_procedures
      )
      VALUES (
        v_booking.company_id, v_booking.client_id, v_reward.id, v_next, now(), v_expiry,
        'available', p_booking_id, v_reward.name, v_reward.description,
        COALESCE(v_reward.reward_value, 0), COALESCE(v_service_ids, '{}'::UUID[]),
        v_reward.required_procedures
      )
      ON CONFLICT (client_id, reward_id, achievement_number) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;

        IF v_user_id IS NOT NULL THEN
          SELECT string_agg(s.name, ', ' ORDER BY s.name)
          INTO v_service_names
          FROM public.services s
          WHERE s.id = ANY(COALESCE(v_service_ids, '{}'::UUID[]));

          INSERT INTO public.company_notifications (
            company_id, target_user_id, type, title, message, link, metadata
          )
          VALUES (
            v_booking.company_id,
            v_user_id,
            'reward_earned',
            '🎁 Você ganhou um brinde!',
            format(
              'Parabéns! Você atingiu %s procedimentos e ganhou "%s". %s%s',
              v_reward.required_procedures,
              v_reward.name,
              CASE WHEN COALESCE(v_service_names, '') <> ''
                THEN 'Você pode resgatar: ' || v_service_names || '. '
                ELSE '' END,
              CASE WHEN COALESCE(v_reward.reward_value, 0) = 0
                THEN 'Valor: grátis.'
                ELSE format('Valor especial: R$ %s.', to_char(v_reward.reward_value, 'FM999999990D00')) END
            ),
            '/client/premios',
            jsonb_build_object(
              'achievement_id', (SELECT id FROM public.client_reward_achievements
                                 WHERE client_id = v_booking.client_id
                                   AND reward_id = v_reward.id
                                   AND achievement_number = v_next),
              'reward_id', v_reward.id,
              'expires_at', v_expiry,
              'source', 'completed_booking'
            )
          );
        END IF;
      END IF;

      v_existing := v_existing + 1;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 2070 — Rastreamento de lembretes de agendamento enviados
--
-- Cria tabela para registrar quais offsets já foram disparados por booking,
-- evitando envios duplicados quando o worker roda a cada N minutos.
--
-- Além disso, cria a view/função `bookings_due_for_reminder` que retorna os
-- agendamentos elegíveis a lembrete, considerando `reminder_offsets_minutes`
-- da coluna `booking_settings` de cada empresa e uma janela de tolerância.
--
-- O agendador (edge function `send-booking-reminders`) chama esta função,
-- dispara `notify-booking-event` com event_key `booking_reminder` e registra
-- o envio em `booking_reminders_sent`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.booking_reminders_sent (
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  offset_minutes INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, offset_minutes)
);

GRANT SELECT, INSERT ON public.booking_reminders_sent TO authenticated;
GRANT ALL ON public.booking_reminders_sent TO service_role;

ALTER TABLE public.booking_reminders_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_sent_service_role_all" ON public.booking_reminders_sent;
CREATE POLICY "reminders_sent_service_role_all"
  ON public.booking_reminders_sent
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "reminders_sent_company_read" ON public.booking_reminders_sent;
CREATE POLICY "reminders_sent_company_read"
  ON public.booking_reminders_sent
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_reminders_sent.booking_id
        AND public.user_belongs_to_company(auth.uid(), b.company_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_booking_reminders_sent_booking
  ON public.booking_reminders_sent(booking_id);

-- ---------------------------------------------------------------------------
-- Função: retorna agendamentos que devem receber lembrete AGORA.
--
-- Considera:
--   * bookings com status 'confirmed' ou 'pending'
--   * data/hora futuras dentro do maior offset configurado por empresa
--   * cada offset configurado no booking_settings.reminder_offsets_minutes
--   * ainda não registrado em booking_reminders_sent para aquele offset
--   * send_reminders = true (default true) e allow booking date >= hoje
--
-- Tolerância: envia se o "momento de disparo" cai dentro de [-tolerance, 0]
-- em relação ao now(). Isso significa que enviamos exatamente no horário do
-- offset ou até `p_tolerance_minutes` depois, cobrindo atrasos do cron.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pending_booking_reminders(
  p_tolerance_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  booking_id UUID,
  company_id UUID,
  offset_minutes INTEGER,
  fire_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH company_offsets AS (
    SELECT
      c.id AS company_id,
      COALESCE(
        (
          SELECT array_agg((elem)::int)
          FROM jsonb_array_elements_text(
            COALESCE(c.booking_settings->'reminder_offsets_minutes', '[1440]'::jsonb)
          ) elem
          WHERE elem ~ '^\d+$'
        ),
        ARRAY[1440]::int[]
      ) AS offsets,
      COALESCE((c.booking_settings->>'send_reminders')::boolean, true) AS enabled
    FROM public.companies c
  ),
  candidates AS (
    SELECT
      b.id AS booking_id,
      b.company_id,
      unnest(co.offsets) AS offset_minutes,
      -- Combina booking_date + booking_time em TZ São Paulo
      ((b.booking_date::text || ' ' || b.booking_time::text)::timestamp
        AT TIME ZONE 'America/Sao_Paulo') AS booking_ts
    FROM public.bookings b
    JOIN company_offsets co ON co.company_id = b.company_id
    WHERE co.enabled = true
      AND b.status IN ('confirmed', 'pending')
      AND b.booking_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  )
  SELECT
    c.booking_id,
    c.company_id,
    c.offset_minutes,
    (c.booking_ts - make_interval(mins => c.offset_minutes)) AS fire_at
  FROM candidates c
  WHERE (c.booking_ts - make_interval(mins => c.offset_minutes))
          BETWEEN (now() - make_interval(mins => p_tolerance_minutes)) AND now()
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_reminders_sent s
      WHERE s.booking_id = c.booking_id
        AND s.offset_minutes = c.offset_minutes
    );
$$;

REVOKE ALL ON FUNCTION public.list_pending_booking_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_booking_reminders(integer) TO service_role;

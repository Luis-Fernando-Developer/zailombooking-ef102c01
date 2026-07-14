-- ============================================================================
-- 2055 — Blindagem final para data/hora vindas de bots/API.
--
-- Sintoma:
--   O bot confirma 15/07/2026 às 08:00, mas o painel/notificação mostra outra
--   data ou horário. Isso acontece quando alguma automação envia start_time em
--   ISO/timestamp e o banco extrai o horário via conversão de fuso.
--
-- Correção:
--   booking_date + booking_time continuam sendo a fonte de verdade. Se um fluxo
--   legado enviar somente start_time ISO, extraímos o relógio literal do texto
--   (T08:00 => 08:00) em vez de converter o timestamp para America/Sao_Paulo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_booking_local_datetime()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_time TIME;
  v_duration INT;
  v_start_text TEXT;
  v_iso_clock TEXT;
BEGIN
  IF NEW.booking_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_time IS NOT NULL THEN
    v_start_time := NEW.booking_time::TIME;
  ELSIF NEW.start_time IS NOT NULL THEN
    -- PostgREST/automações podem enviar "2026-07-15T08:00:00Z" quando o
    -- usuário escolheu 08:00. Converter esse timestamptz para BRT transforma
    -- 08:00Z em 05:00, que é errado para o contrato do agendamento. Então,
    -- quando houver texto ISO, usamos o horário literal do payload.
    v_start_text := NEW.start_time::TEXT;
    v_iso_clock := substring(v_start_text from 'T([0-9]{2}:[0-9]{2}(?::[0-9]{2})?)');

    IF v_iso_clock IS NOT NULL THEN
      v_start_time := v_iso_clock::TIME;
    ELSE
      v_start_time := (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME;
    END IF;

    NEW.booking_time := v_start_time;
  ELSE
    RETURN NEW;
  END IF;

  v_duration := NEW.duration_minutes;

  IF v_duration IS NULL AND NEW.service_id IS NOT NULL THEN
    SELECT COALESCE(s.duration_minutes, 30)
      INTO v_duration
      FROM public.services s
     WHERE s.id = NEW.service_id
     LIMIT 1;
  END IF;

  v_duration := COALESCE(v_duration, 30);
  NEW.duration_minutes := COALESCE(NEW.duration_minutes, v_duration);

  NEW.booking_time := v_start_time;
  NEW.start_time := (NEW.booking_date::TEXT || ' ' || v_start_time::TEXT || '-03')::TIMESTAMPTZ;
  NEW.end_time := NEW.start_time + (v_duration || ' minutes')::INTERVAL;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
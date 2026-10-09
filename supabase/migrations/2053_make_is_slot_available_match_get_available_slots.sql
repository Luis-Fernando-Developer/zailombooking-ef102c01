-- ============================================================================
-- 2053 — Faz o gate de escrita bater com o GET de disponibilidade.
--
-- Sintoma:
--   GET /v1/availability/slots retorna um horário, mas POST /v1/bookings
--   devolve 409 slot_unavailable para o mesmo company/employee/service/date/time.
--
-- Causa:
--   A API pública confirmava com public.is_slot_available, enquanto a consulta de
--   horários usa public.get_available_slots. Qualquer divergência entre as duas
--   funções gera falso 409.
--
-- Correção:
--   Para criação normal (p_ignore_booking IS NULL), is_slot_available passa a ser
--   literalmente: “o horário está na lista retornada por get_available_slots”.
--   Para fluxos de reagendamento que informam p_ignore_booking, mantém uma
--   checagem conservadora de conflito excluindo o próprio agendamento.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_slot_available(
  p_company         UUID,
  p_employee        UUID,
  p_service         UUID,
  p_date            DATE,
  p_start           TIME,
  p_ignore_booking  UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration INT;
  v_end TIME;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.get_available_slots(p_company, p_employee, p_service, p_date) gs
     WHERE gs.slot = p_start
  ) THEN
    RETURN TRUE;
  END IF;

  IF p_ignore_booking IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(duration_minutes, 30)
    INTO v_duration
    FROM public.services
   WHERE id = p_service
     AND company_id = p_company;

  IF v_duration IS NULL THEN
    RETURN FALSE;
  END IF;

  v_end := (p_start::INTERVAL + (v_duration || ' min')::INTERVAL)::TIME;

  RETURN NOT EXISTS (
    SELECT 1
      FROM public.bookings bk
     WHERE bk.company_id = p_company
       AND bk.employee_id = p_employee
       AND bk.booking_date = p_date
       AND bk.id <> p_ignore_booking
       AND LOWER(COALESCE(bk.booking_status::TEXT, '')) NOT IN ('cancelled','canceled','rejected','no_show')
       AND (p_start, v_end) OVERLAPS (
             ((bk.start_time AT TIME ZONE 'America/Sao_Paulo'))::TIME,
             COALESCE(
               ((bk.end_time AT TIME ZONE 'America/Sao_Paulo'))::TIME,
               (((bk.start_time AT TIME ZONE 'America/Sao_Paulo'))::TIME
                  + (COALESCE(bk.duration_minutes, 30) || ' min')::INTERVAL)
             )
           )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_slot_available(UUID, UUID, UUID, DATE, TIME, UUID)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
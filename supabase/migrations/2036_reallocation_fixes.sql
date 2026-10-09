-- ============================================================================
-- 2036 — Correções de Realocação
--   1) Adiciona coluna bookings.cancellation_reason (faltante).
--   2) Cria RPC list_available_dates(p_company, p_employee, p_service, p_from, p_to)
--      que retorna apenas as datas com ao menos um slot livre, respeitando:
--        - escala aprovada (entry_type 'T' com horários)
--        - desligamento programado (termination_effective_date)
--        - ausências
--        - business_hours
--        - max_advance_days (booking_settings ou company_schedule_settings)
--   3) Reaproveita get_available_slots para a verificação por dia.
-- Deploy manual. Sem alteração de verify_jwt (RPC é SECURITY DEFINER).
-- ============================================================================

-- 1) Coluna de motivo de cancelamento
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

NOTIFY pgrst, 'reload schema';

-- 2) RPC list_available_dates
CREATE OR REPLACE FUNCTION public.list_available_dates(
  p_company  UUID,
  p_employee UUID,
  p_service  UUID,
  p_from     DATE,
  p_to       DATE
) RETURNS TABLE(available_date DATE)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today      DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_max_adv    INT;
  v_bs         JSONB;
  v_from       DATE := GREATEST(p_from, v_today);
  v_to         DATE := p_to;
  v_cutoff     DATE;
  d            DATE;
BEGIN
  SELECT booking_settings INTO v_bs FROM public.companies WHERE id = p_company;
  v_bs := COALESCE(v_bs, '{}'::jsonb);

  SELECT COALESCE(
    css.max_advance_days,
    (v_bs->>'advance_booking_days')::INT,
    (v_bs->>'max_advance_days')::INT,
    365
  )
  INTO v_max_adv
  FROM (SELECT 1) x
  LEFT JOIN public.company_schedule_settings css ON css.company_id = p_company;

  v_cutoff := v_today + COALESCE(v_max_adv, 365);
  IF v_to > v_cutoff THEN v_to := v_cutoff; END IF;
  IF v_from > v_to THEN RETURN; END IF;

  FOR d IN
    SELECT generate_series(v_from, v_to, INTERVAL '1 day')::DATE
  LOOP
    IF EXISTS (
      SELECT 1
        FROM public.get_available_slots(p_company, p_employee, p_service, d) s
       WHERE s.slot IS NOT NULL
       LIMIT 1
    ) THEN
      available_date := d;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END $$;

GRANT EXECUTE ON FUNCTION public.list_available_dates(uuid,uuid,uuid,date,date)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

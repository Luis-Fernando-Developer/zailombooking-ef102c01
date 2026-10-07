-- 2207 — criação segura de agendamento com pagamento no local pela página pública.
--
-- O cliente autenticado não possui a permissão administrativa bookings.create,
-- portanto a RLS de bookings não deve ser aberta para INSERT direto.
-- A página pública usa esta RPC, que valida o vínculo cliente/empresa e
-- cria somente agendamentos pendentes com pagamento local.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_local_booking(
  p_company_id UUID,
  p_employee_id UUID,
  p_service_id UUID,
  p_combo_id UUID,
  p_client_id UUID,
  p_booking_date DATE,
  p_booking_time TIME,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_duration_minutes INTEGER,
  p_price NUMERIC,
  p_notes TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF p_company_id IS NULL
     OR p_employee_id IS NULL
     OR p_client_id IS NULL
     OR p_booking_date IS NULL
     OR p_booking_time IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios do agendamento não informados.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = p_client_id
      AND c.company_id = p_company_id
      AND c.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cliente inválido para esta sessão.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.company_id = p_company_id
      AND e.is_active = true
  ) THEN
    RAISE EXCEPTION 'Profissional inválido para esta empresa.';
  END IF;

  IF p_service_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.services s
       WHERE s.id = p_service_id
         AND s.company_id = p_company_id
         AND s.is_active = true
     ) THEN
    RAISE EXCEPTION 'Serviço inválido para esta empresa.';
  END IF;

  IF p_combo_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.service_combos sc
       WHERE sc.id = p_combo_id
         AND sc.company_id = p_company_id
         AND sc.is_active = true
     ) THEN
    RAISE EXCEPTION 'Combo inválido para esta empresa.';
  END IF;

  IF p_service_id IS NULL AND p_combo_id IS NULL THEN
    RAISE EXCEPTION 'O agendamento precisa informar um serviço ou combo.';
  END IF;

  IF COALESCE(p_duration_minutes, 0) <= 0 THEN
    RAISE EXCEPTION 'Duração do agendamento inválida.';
  END IF;

  INSERT INTO public.bookings (
    company_id,
    employee_id,
    service_id,
    combo_id,
    booking_time,
    start_time,
    end_time,
    booking_date,
    duration_minutes,
    price,
    notes,
    client_id,
    created_source,
    booking_status,
    payment_status,
    payment_method
  )
  VALUES (
    p_company_id,
    p_employee_id,
    p_service_id,
    p_combo_id,
    p_booking_time,
    p_start_time,
    p_end_time,
    p_booking_date,
    p_duration_minutes,
    COALESCE(p_price, 0),
    COALESCE(p_notes, ''),
    p_client_id,
    'landingpage',
    'pending',
    'pending',
    'local'
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_local_booking(
  UUID, UUID, UUID, UUID, UUID, DATE, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, NUMERIC, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_local_booking(
  UUID, UUID, UUID, UUID, UUID, DATE, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, NUMERIC, TEXT
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

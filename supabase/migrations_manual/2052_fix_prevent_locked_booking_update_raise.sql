-- ============================================================================
-- 2052 — Hotfix: RAISE option already specified: MESSAGE
--
-- Sintoma ao rodar a 2051 (ou qualquer UPDATE em bookings):
--   ERROR: 42601: RAISE option already specified: MESSAGE
--   CONTEXT: PL/pgSQL function prevent_locked_booking_update() line 20 at RAISE
--
-- Causa:
--   Em 2043 a função usa `RAISE EXCEPTION 'codigo' USING MESSAGE = '...'`.
--   O primeiro argumento literal do RAISE já é o MESSAGE; o USING MESSAGE
--   tenta redefinir a mesma opção → Postgres aborta.
--
-- Correção:
--   Usar USING MESSAGE + DETAIL (com o "código" indo em DETAIL) e ERRCODE
--   customizado. Assim mantemos a mensagem em PT-BR para o usuário e o
--   identificador legível por máquina em DETAIL, sem duplicar MESSAGE.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_locked_booking_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_no_show_keys TEXT[] := ARRAY[
    'booking_date', 'start_time', 'end_time', 'employee_id', 'service_id',
    'booking_status', 'updated_at'
  ];
  v_allowed_finalize_keys TEXT[] := ARRAY[
    'booking_status', 'cancellation_reason', 'updated_at'
  ];
BEGIN
  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) NOT IN ('cancelled', 'canceled', 'completed', 'no_show')
     AND LOWER(COALESCE(NEW.booking_status::TEXT, '')) IN ('cancelled', 'canceled', 'completed', 'no_show')
     AND (to_jsonb(NEW) - v_allowed_finalize_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_finalize_keys) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Ao cancelar, concluir ou marcar não compareceu, apenas o status pode ser alterado.',
      DETAIL  = 'booking_finalize_status_only',
      ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) IN ('cancelled', 'canceled', 'completed')
     AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Agendamento cancelado ou concluído é imutável.',
      DETAIL  = 'booking_locked_final_status',
      ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(OLD.booking_status::TEXT, '')) = 'no_show' THEN
    IF (to_jsonb(NEW) - v_allowed_no_show_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_no_show_keys) THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Agendamento marcado como não compareceu só pode ser reagendado.',
        DETAIL  = 'booking_no_show_allows_only_reschedule',
        ERRCODE = 'P0001';
    END IF;

    IF LOWER(COALESCE(NEW.booking_status::TEXT, '')) NOT IN ('no_show', 'confirmed', 'pending') THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Não compareceu só pode permanecer como está ou voltar para confirmado/pendente ao reagendar.',
        DETAIL  = 'booking_no_show_invalid_next_status',
        ERRCODE = 'P0001';
    END IF;

    IF NEW.booking_date IS NOT DISTINCT FROM OLD.booking_date
       AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
       AND NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Para alterar um não comparecimento, escolha uma nova data, horário ou profissional.',
        DETAIL  = 'booking_no_show_requires_new_slot',
        ERRCODE = 'P0001';
    END IF;

    IF NOT public.is_slot_available(
      OLD.company_id,
      COALESCE(NEW.employee_id, OLD.employee_id),
      COALESCE(NEW.service_id, OLD.service_id),
      NEW.booking_date,
      NEW.start_time::TIME,
      OLD.id
    ) THEN
      RAISE EXCEPTION USING
        MESSAGE = 'O novo horário não está disponível na escala atual.',
        DETAIL  = 'booking_no_show_slot_unavailable',
        ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill seguro de total_price (evita disparar o lock em bookings finalizados,
-- mesmo com a função já corrigida — não queremos que um UPDATE de coluna
-- auxiliar seja bloqueado). Desabilitamos o trigger só nesta transação.
ALTER TABLE public.bookings DISABLE TRIGGER trg_prevent_locked_booking_update;

UPDATE public.bookings
   SET total_price = price
 WHERE total_price IS NULL
   AND price IS NOT NULL;

ALTER TABLE public.bookings ENABLE TRIGGER trg_prevent_locked_booking_update;

NOTIFY pgrst, 'reload schema';

COMMIT;

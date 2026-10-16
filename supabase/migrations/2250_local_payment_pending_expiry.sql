-- 2250 — expiração configurável de solicitações de pagamento no local.
-- O prazo padrão é 120 minutos. As configurações ficam em companies.booking_settings.
-- A expiração é aplicada no banco para não depender exclusivamente do worker.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS local_payment_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS local_payment_expired_at TIMESTAMPTZ;

-- Valores padrão explícitos para todas as empresas existentes.
UPDATE public.companies
SET booking_settings = COALESCE(booking_settings, '{}'::jsonb)
  || jsonb_build_object(
       'local_payment_expiry_enabled',
       COALESCE((booking_settings->>'local_payment_expiry_enabled')::boolean, true),
       'local_payment_expiry_minutes',
       CASE
         WHEN COALESCE(booking_settings->>'local_payment_expiry_minutes', '') ~ '^\d+$'
           AND (booking_settings->>'local_payment_expiry_minutes')::integer BETWEEN 5 AND 1440
         THEN (booking_settings->>'local_payment_expiry_minutes')::integer
         ELSE 120
       END,
       'local_payment_expiry_notify_client',
       COALESCE((booking_settings->>'local_payment_expiry_notify_client')::boolean, true)
     )
WHERE booking_settings IS NULL
   OR NOT (booking_settings ? 'local_payment_expiry_enabled')
   OR NOT (booking_settings ? 'local_payment_expiry_minutes')
   OR NOT (booking_settings ? 'local_payment_expiry_notify_client');

-- Compatibilidade: pedidos locais pendentes antigos recebem prazo com base
-- na criação original, respeitando a configuração atual da empresa.
UPDATE public.bookings b
SET local_payment_expires_at =
      b.created_at + make_interval(mins => CASE
        WHEN COALESCE(c.booking_settings->>'local_payment_expiry_minutes', '') ~ '^\d+$'
          AND (c.booking_settings->>'local_payment_expiry_minutes')::integer BETWEEN 5 AND 1440
        THEN (c.booking_settings->>'local_payment_expiry_minutes')::integer
        ELSE 120
      END)
FROM public.companies c
WHERE c.id = b.company_id
  AND LOWER(COALESCE(b.booking_status::text, '')) = 'pending'
  AND LOWER(COALESCE(b.payment_method::text, '')) = 'local'
  AND b.local_payment_expires_at IS NULL
  AND COALESCE((c.booking_settings->>'local_payment_expiry_enabled')::boolean, true);

CREATE INDEX IF NOT EXISTS idx_bookings_local_payment_expiry
  ON public.bookings (local_payment_expires_at)
  WHERE LOWER(COALESCE(booking_status::text, '')) = 'pending'
    AND LOWER(COALESCE(payment_method::text, '')) = 'local';

CREATE OR REPLACE FUNCTION public.set_local_booking_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_enabled BOOLEAN;
  v_minutes INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND LOWER(COALESCE(OLD.booking_status::text, '')) = 'pending'
     AND LOWER(COALESCE(OLD.payment_method::text, '')) = 'local'
     AND LOWER(COALESCE(NEW.booking_status::text, '')) = 'confirmed'
     AND OLD.local_payment_expires_at IS NOT NULL
     AND OLD.local_payment_expires_at <= now() THEN
    RAISE EXCEPTION USING
      MESSAGE = 'O prazo para confirmar este agendamento expirou.',
      DETAIL = 'local_booking_expired',
      ERRCODE = 'P0001';
  END IF;

  IF LOWER(COALESCE(NEW.booking_status::text, '')) <> 'pending'
     OR LOWER(COALESCE(NEW.payment_method::text, '')) <> 'local' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(c.booking_settings, '{}'::jsonb)
    INTO v_settings
    FROM public.companies c
   WHERE c.id = NEW.company_id;

  v_enabled := COALESCE((v_settings->>'local_payment_expiry_enabled')::boolean, true);
  v_minutes := CASE
    WHEN COALESCE(v_settings->>'local_payment_expiry_minutes', '') ~ '^\d+$'
      AND (v_settings->>'local_payment_expiry_minutes')::integer BETWEEN 5 AND 1440
    THEN (v_settings->>'local_payment_expiry_minutes')::integer
    ELSE 120
  END;

  IF v_enabled THEN
    NEW.local_payment_expires_at := COALESCE(
      NEW.local_payment_expires_at,
      now() + make_interval(mins => v_minutes)
    );
  ELSE
    NEW.local_payment_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_local_booking_expiry ON public.bookings;
CREATE TRIGGER trg_set_local_booking_expiry
BEFORE INSERT OR UPDATE OF booking_status, payment_method, company_id
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_local_booking_expiry();

-- Worker de serviço: expira pedidos vencidos de forma idempotente e devolve
-- apenas os que foram alterados nesta execução, para não duplicar avisos.
CREATE OR REPLACE FUNCTION public.expire_pending_local_bookings()
RETURNS TABLE (
  booking_id UUID,
  company_id UUID,
  notify_client BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH expired AS (
    UPDATE public.bookings b
       SET booking_status = 'cancelled',
           local_payment_expired_at = now(),
           updated_at = now(),
           notes = concat_ws(E'\n', NULLIF(b.notes, ''), 'Cancelado automaticamente: prazo para pagamento no local expirado.')
      FROM public.companies c
     WHERE c.id = b.company_id
       AND LOWER(COALESCE(b.booking_status::text, '')) = 'pending'
       AND LOWER(COALESCE(b.payment_method::text, '')) = 'local'
       AND b.local_payment_expires_at IS NOT NULL
       AND b.local_payment_expires_at <= now()
       AND COALESCE((c.booking_settings->>'local_payment_expiry_enabled')::boolean, true)
    RETURNING b.id, b.company_id, COALESCE((c.booking_settings->>'local_payment_expiry_notify_client')::boolean, true) AS should_notify
  )
  SELECT expired.id, expired.company_id, expired.should_notify
    FROM expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_pending_local_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_local_bookings() TO service_role;

-- Agendamentos vencidos deixam de ocupar horários mesmo se o worker estiver
-- atrasado. Os pedidos locais não vencidos passam a bloquear o horário.
DO $$
DECLARE
  v_def TEXT;
  v_old TEXT := $needle$
      AND NOT (
        LOWER(COALESCE(bk.booking_status::text,'')) = 'pending'
        AND LOWER(COALESCE(bk.payment_method::text,'')) = 'local'
      )
$needle$;
  v_new TEXT := $replacement$
      AND NOT (
        LOWER(COALESCE(bk.booking_status::text,'')) = 'pending'
        AND LOWER(COALESCE(bk.payment_method::text,'')) = 'local'
        AND COALESCE((
          SELECT (co.booking_settings->>'local_payment_expiry_enabled')::boolean
            FROM public.companies co
           WHERE co.id = bk.company_id
        ), true)
        AND bk.local_payment_expires_at IS NOT NULL
        AND bk.local_payment_expires_at <= now()
      )
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_available_slots(uuid,uuid,uuid,date,boolean)'::regprocedure
  ) INTO v_def;

  IF position(v_old IN v_def) = 0 THEN
    -- Se a definição atual não contiver a exclusão antiga, não altere a função
    -- às cegas; falhe a migration para que a disponibilidade seja revisada.
    RAISE EXCEPTION 'Não foi possível localizar o filtro legado de pagamento local em get_available_slots.';
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

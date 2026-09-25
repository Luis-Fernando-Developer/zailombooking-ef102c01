-- 2180: identifica a origem do agendamento nas notificações da empresa.
BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS created_source text NOT NULL DEFAULT 'landingpage';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_created_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_created_source_check
  CHECK (created_source IN ('landingpage', 'business_panel', 'chatbot', 'api'));

CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_source_label TEXT;
BEGIN
  SELECT name INTO v_client_name
  FROM public.clients
  WHERE id = NEW.client_id;

  v_source_label := CASE NEW.created_source
    WHEN 'business_panel' THEN 'criado pelo painel da empresa'
    WHEN 'chatbot' THEN 'criado pelo chatbot'
    WHEN 'api' THEN 'criado via API'
    ELSE 'agendou diretamente pela página da empresa'
  END;

  INSERT INTO public.company_notifications (
    company_id, type, title, message, link, metadata
  )
  VALUES (
    NEW.company_id,
    'booking_created',
    'Novo agendamento',
    COALESCE(v_client_name, 'Cliente') || ' - ' || v_source_label || ' para ' ||
      to_char(NEW.booking_date, 'DD/MM') || ' às ' ||
      to_char(NEW.start_time, 'HH24:MI'),
    '/business/bookings',
    jsonb_build_object(
      'booking_id', NEW.id,
      'client_id', NEW.client_id,
      'created_source', NEW.created_source,
      'payment_method', NEW.payment_method
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_created ON public.bookings;

CREATE TRIGGER trg_notify_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_created();

NOTIFY pgrst, 'reload schema';

COMMIT;

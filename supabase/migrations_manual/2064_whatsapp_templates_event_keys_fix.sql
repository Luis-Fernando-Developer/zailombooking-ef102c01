-- ============================================================================
-- 2064 — Corrige chaves dos templates WhatsApp
-- ----------------------------------------------------------------------------
-- A migration 2059 criou um CHECK com chaves antigas no formato "booking.*".
-- A UI e as Edge Functions atuais usam snake_case (booking_cancelled, etc.).
-- Resultado: o editor parecia salvar, mas o upsert era bloqueado pelo CHECK e
-- as notificações caíam no fallback hardcoded.
-- ============================================================================

ALTER TABLE public.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_event_key_check;

-- O template marketing.custom foi movido para Automações > Disparos WhatsApp.
DELETE FROM public.whatsapp_templates
 WHERE event_key = 'marketing.custom';

-- Migra registros antigos sem sobrescrever um template novo já customizado.
DELETE FROM public.whatsapp_templates old
 WHERE old.event_key = 'booking.created'
   AND EXISTS (
     SELECT 1 FROM public.whatsapp_templates newer
      WHERE newer.company_id = old.company_id
        AND newer.event_key = 'booking_pending'
   );
UPDATE public.whatsapp_templates
   SET event_key = 'booking_pending', updated_at = now()
 WHERE event_key = 'booking.created';

DELETE FROM public.whatsapp_templates old
 WHERE old.event_key = 'booking.confirmed'
   AND EXISTS (
     SELECT 1 FROM public.whatsapp_templates newer
      WHERE newer.company_id = old.company_id
        AND newer.event_key = 'booking_confirmed'
   );
UPDATE public.whatsapp_templates
   SET event_key = 'booking_confirmed', updated_at = now()
 WHERE event_key = 'booking.confirmed';

DELETE FROM public.whatsapp_templates old
 WHERE old.event_key = 'booking.cancelled'
   AND EXISTS (
     SELECT 1 FROM public.whatsapp_templates newer
      WHERE newer.company_id = old.company_id
        AND newer.event_key = 'booking_cancelled'
   );
UPDATE public.whatsapp_templates
   SET event_key = 'booking_cancelled', updated_at = now()
 WHERE event_key = 'booking.cancelled';

DELETE FROM public.whatsapp_templates old
 WHERE old.event_key = 'booking.rescheduled'
   AND EXISTS (
     SELECT 1 FROM public.whatsapp_templates newer
      WHERE newer.company_id = old.company_id
        AND newer.event_key = 'booking_rescheduled'
   );
UPDATE public.whatsapp_templates
   SET event_key = 'booking_rescheduled', updated_at = now()
 WHERE event_key = 'booking.rescheduled';

DELETE FROM public.whatsapp_templates old
 WHERE old.event_key = 'booking.reminder'
   AND EXISTS (
     SELECT 1 FROM public.whatsapp_templates newer
      WHERE newer.company_id = old.company_id
        AND newer.event_key = 'booking_reminder'
   );
UPDATE public.whatsapp_templates
   SET event_key = 'booking_reminder', updated_at = now()
 WHERE event_key = 'booking.reminder';

ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_event_key_check
  CHECK (event_key IN (
    'booking_created',
    'booking_pending',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show',
    'booking_rescheduled',
    'booking_reallocated',
    'booking_reminder',
    'payment_confirmed',
    'payment_pending'
  ));

NOTIFY pgrst, 'reload schema';
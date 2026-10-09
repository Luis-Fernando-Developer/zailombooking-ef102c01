-- Adiciona coluna JSONB para persistir configurações de agendamento da empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_settings JSONB NOT NULL DEFAULT jsonb_build_object(
    'allow_online_booking', true,
    'require_confirmation', true,
    'send_reminders', true,
    'advance_booking_days', 30,
    'cancellation_policy', ''
  );

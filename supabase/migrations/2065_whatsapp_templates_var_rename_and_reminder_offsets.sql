-- ============================================================================
-- 2065 — Renomeia variáveis dos templates WhatsApp já salvos e adiciona
-- configuração de lembretes (offsets antes do agendamento).
--
-- Contexto:
--   As mensagens usavam {{booking_date}}, {{booking_time}} e {{reason}}.
--   O renderizador atual só substitui {{date}}, {{time}}, {{client_name}},
--   {{service_name}}, {{employee_name}}, {{company_name}}.
--   Rows antigas ficavam com placeholders literais na mensagem.
--
-- Ações:
--   1) Reescreve todas as linhas de public.whatsapp_templates trocando os
--      nomes antigos pelos novos.
--   2) Adiciona a chave reminder_offsets_minutes (array de inteiros) ao
--      booking_settings de cada empresa. Default: [1440] (24h antes).
-- ============================================================================

-- 1) Renomeia variáveis nos templates existentes ------------------------------
UPDATE public.whatsapp_templates
SET template = regexp_replace(
                 regexp_replace(
                   regexp_replace(template,
                     '\{\{\s*booking_date\s*\}\}', '{{date}}', 'g'),
                   '\{\{\s*booking_time\s*\}\}', '{{time}}', 'g'),
                 '\{\{\s*reason\s*\}\}', '', 'g'),
    updated_at = now()
WHERE template ~ '\{\{\s*(booking_date|booking_time|reason)\s*\}\}';

-- 2) Adiciona reminder_offsets_minutes ao booking_settings --------------------
UPDATE public.companies
SET booking_settings = COALESCE(booking_settings, '{}'::jsonb)
                       || jsonb_build_object('reminder_offsets_minutes',
                            COALESCE(booking_settings->'reminder_offsets_minutes',
                                     '[1440]'::jsonb))
WHERE booking_settings IS NULL
   OR NOT (booking_settings ? 'reminder_offsets_minutes');

-- Atualiza o DEFAULT da coluna para incluir a nova chave em empresas futuras.
ALTER TABLE public.companies
  ALTER COLUMN booking_settings SET DEFAULT jsonb_build_object(
    'allow_online_booking', true,
    'require_confirmation', true,
    'send_reminders', true,
    'advance_booking_days', 30,
    'cancellation_policy', '',
    'reminder_offsets_minutes', jsonb_build_array(1440)
  );

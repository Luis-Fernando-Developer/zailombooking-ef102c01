# Edge Functions — Módulo Marketing

## 1) `marketing-publish-scheduler`
- **Verify JWT:** **DESATIVADO**
- **Objetivo:** ativar campanhas agendadas e encerrar campanhas vencidas.
- **Agendamento sugerido (pg_cron):**
  ```sql
  select cron.schedule(
    'mkt-publish-scheduler', '*/5 * * * *',
    $$ select net.http_post(
        url := 'https://<PROJECT>.supabase.co/functions/v1/marketing-publish-scheduler',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
       ); $$
  );
  ```
- **Deploy:** `supabase functions deploy marketing-publish-scheduler --no-verify-jwt`

## 2) `marketing-notify`
- **Verify JWT:** **ATIVADO**
- **Objetivo:** disparar notificações internas para a audiência configurada na campanha.
- **Payload:** `{ campaignId, title, message, scheduleAt? }`
- **Deploy:** `supabase functions deploy marketing-notify`

## 3) `marketing-revoke`
- **Verify JWT:** **ATIVADO**
- **Objetivo:** permitir que owner/manager/rh/marketing revoguem uma campanha em curso.
- **Payload:** `{ campaignId, reason }`
- **Deploy:** `supabase functions deploy marketing-revoke`

## Pré-requisitos
1. Executar `supabase/migrations_manual/2026_marketing.sql` no SQL Editor.
2. Ajustar role do colaborador (`employees.role`) para um dos: `owner`, `manager`, `rh`, `marketing`, `designer`.
3. Bucket `marketing-assets` criado pela migration (público).

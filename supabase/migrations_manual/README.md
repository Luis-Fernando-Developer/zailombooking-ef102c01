# Deploy manual — Fase 2 (Módulo Solicitações)

## 1. SQL
Rodar no SQL Editor do Supabase, nesta ordem:

1. `2026_solicitacoes.sql` — tabelas `requests`, `request_comments`, `request_audit_log`, `request_approval_rules`, helper `user_belongs_to_company`. Idempotente.
2. `2026_escalas.sql` — **NOVO** — tabelas `schedule_templates`, `schedule_cycles_config`, `schedules`, `schedule_entries`. Depende do arquivo acima (usa `user_belongs_to_company` e `touch_updated_at`).

## 2. Edge Functions

```bash
supabase functions deploy request-create   --no-verify-jwt
supabase functions deploy request-decide   --no-verify-jwt
supabase functions deploy request-apply    --no-verify-jwt
supabase functions deploy schedule-generate --no-verify-jwt   # NOVO
supabase functions deploy schedule-submit   --no-verify-jwt   # NOVO
```

- **request-create / request-decide / request-apply**: motor genérico de solicitações.
- **schedule-generate** (NOVO): gera `schedule_entries` automaticamente para uma escala em `draft`, considerando template, business_hours, ausências aprovadas e desligamentos.
- **schedule-submit** (NOVO): promove escala `draft → pending_approval` e cria a request vinculada (`schedule_change`).

## 3. Próximo passo
Quando o SQL e as functions estiverem deployados, me avisa que aplico o **Frontend Fase 2** (lista de escalas, modal de criação, editor matricial, e refator do drawer de aprovação para tabela linha-a-linha).

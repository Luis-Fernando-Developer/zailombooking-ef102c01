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

## 3. Re-deploy obrigatório após Fase 2

`request-apply` foi atualizada para entender o novo payload com `schedule_id` e aplicar decisões linha-a-linha em `schedule_entries`, marcando o `schedules.status` como `approved` / `partially_approved` / `rejected`. Re-deploy:

```bash
supabase functions deploy request-apply --no-verify-jwt
```

Fluxo final:
1. Manager cria escala em `/admin/horarios → aba Escalas` → editor matricial → "Gerar" (chama schedule-generate) → ajusta células → "Enviar para aprovação" (chama schedule-submit, cria `requests` do tipo `schedule_change` com `schedule_id`).
2. Aprovador abre `Solicitações`, clica na request → `RequestDetailDrawer` mostra `ScheduleApprovalTable` (linha-a-linha) com bulk approve/reject/revise.
3. Ao "Aprovar" a request, `request-apply` lê os entries e marca a escala como `approved` ou `partially_approved`.


---

## Módulo Feature Registry + Release Notes

### SQL
Rodar `2026_feature_registry.sql` no SQL Editor. Cria: `feature_registry`, `release_notes`, `platform_notifications`, `notification_views` + helper `is_super_admin` + RLS.

> Depende da existência da tabela `public.user_roles` com role `super_admin`.

### Edge Functions

```bash
supabase functions deploy generate-release-notes --no-verify-jwt
```

> A função valida JWT em código (somente `super_admin`). Usa `LOVABLE_API_KEY` (auto-provisionada — nenhuma chave de OpenAI necessária).

### Rotas frontend
- `/super-admin/features` — Central de features + botão "Gerar Release Notes com IA"
- `/super-admin/release-notes` — Revisar, editar, definir público-alvo e publicar
- Modal automático no `BusinessLayout` exibe a próxima release não-visualizada para a empresa logada.

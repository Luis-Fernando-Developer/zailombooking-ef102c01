# Plano: Limites de plano corretos + Ciclo de faturamento em 4 camadas + Extras

Escopo grande. Vou dividir em blocos com dependências claras. Confirme para eu implementar tudo em sequência.

## Bloco 1 — Corrigir tabela `plan_limits` (fonte da verdade)

Migração `2071_plan_limits_correct_values.sql`:

- Adicionar coluna `white_label BOOLEAN DEFAULT false` em `plan_limits`.
- `UPSERT` dos 3 planos com os valores corretos abaixo (`-1` = ilimitado):

| Recurso | starter | professional | enterprise |
|---|---|---|---|
| max_employees | 1 | 5 | -1 |
| max_services | 5 | 12 | -1 |
| max_bookings_month | 200 | 700 | -1 |
| max_chatbots | 1 | 3 | -1 |
| max_whatsapp_instances | 1 | 3 | -1 |
| max_integrations | 2 | 10 | -1 |
| max_chatbot_messages | 700 | 5000 | -1 |
| white_label | false | true | true |

- Corrigir o `combos` no `usePlanLimits` para usar `max_services` (já está) — ok.

## Bloco 2 — Ciclo de faturamento em 4 camadas

Migração `2072_billing_cycle_enforcement.sql`:

**Campos adicionados em `company_subscriptions`:**
- `cycle_start_at TIMESTAMPTZ` — momento da adesão/último renovamento efetivo.
- `next_renewal_at TIMESTAMPTZ` — cycle_start_at + intervalo do ciclo (monthly/quarterly/annual).
- `next_invoice_at TIMESTAMPTZ` — `next_renewal_at - 5 dias`.
- `grace_until TIMESTAMPTZ` — `next_renewal_at + 24h` (suspensão se não pago).
- `status TEXT CHECK IN ('active','past_due','suspended','paused','blocked')`.
- `is_free_override BOOLEAN` + `free_cycles_remaining INT` — para 100% desconto do super-admin.
- `manual_admin_created BOOLEAN` — flag da camada 4.

**Função `enforce_subscription_status(company_id)`** roda as 4 camadas:
1. Se `status IN ('paused','blocked')` → bloqueado, sai.
2. Se `now() > grace_until` E fatura mais recente não paga → `status='suspended'`.
3. Se `is_free_override=true` E `free_cycles_remaining <= 0` E fatura não paga → aplica camada 2.
4. Se `manual_admin_created=true` → mesma lógica da camada 2 (libera só após pagamento confirmado).

Ao pagar (`asaas-webhook`): move `cycle_start_at = now()`, recalcula `next_renewal_at`, decrementa `free_cycles_remaining`, zera contadores mensais (via reset function abaixo).

**Reset mensal (pg_cron):** worker roda 1x/hora, chama `enforce_subscription_status` para todas empresas cujo `next_renewal_at <= now()`. Reseta `bookings_month` e `chatbot_messages` counters somente quando o ciclo renova (não em data fixa do mês).

**Guard universal:** função `is_company_active(company_id) RETURNS BOOLEAN` — chamada por todos os `check_plan_limit` e pelas Edge Functions críticas. Empresa suspensa retorna `allowed=false, reason='subscription_suspended'`.

## Bloco 3 — Frontend: aplicar bloqueio real

- `usePlanLimits.guard()` já bloqueia; adicionar retorno de `subscription_status` e mostrar toast específico "Sua assinatura está suspensa. Regularize o pagamento."
- Novo componente `<SubscriptionSuspendedBanner>` global no `BusinessLayout`, ocultando funcionalidades quando `status='suspended'`.
- Aplicar `guard()` nos formulários que ainda não têm: Employees, Services, WhatsApp instances, Chatbots, Integrations.

## Bloco 4 — Super Admin: Instâncias WhatsApp (globais)

Refatorar `src/pages/super-admin/Instances.tsx`:

- Nova Edge Function `super-admin-list-instances`: chama Evolution Manager API com a key global `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (endpoint `GET /instance/fetchInstances`) e enriquece cada instância com o `company_id` correspondente (join em `whatsapp_instances`).
- UI lista todas as instâncias com: nome, status, número, empresa dona, última conexão, botão de desconectar/deletar (opcional).
- **Segurança:** a key global é salva via `secrets--set_secret` como `EVOLUTION_MANAGER_KEY` — nunca vai pro frontend.

## Bloco 5 — Super Admin: Editor de Planos

Refatorar `src/pages/super-admin/Plans.tsx`:

- Ler valores de `plan_limits` via query (não hardcoded).
- Card de cada plano com botão "Editar" que abre `<PlanEditDialog>`:
  - Campos numéricos para todos os `max_*` (com toggle "ilimitado" que grava `-1`).
  - Toggle `white_label`.
  - Campos de preço (`monthly`, `quarterly`, `annual`) — nova tabela `plan_prices` ou colunas em `subscription_plans`.
- Persiste via update em `plan_limits` (nova policy: super-admin only).

## Bloco 6 — Card de agendamento com método de pagamento

Em `src/pages/business/Bookings.tsx` (e `Dashboard.tsx`):

- Ler `payment_method` (`online` | `local` | `pending`) do booking.
- Badge no card: 🟢 "Pago online", 🟡 "Pagar no local", ⚪ "Pendente".
- Se não existir a coluna, migração `2073_bookings_payment_method.sql` adiciona: `payment_method TEXT CHECK IN ('online','local','pending') DEFAULT 'local'`.

## Detalhes técnicos

- **Segurança**: `EVOLUTION_MANAGER_KEY` só em Edge Function. RLS em `plan_limits` (SELECT público / UPDATE só super-admin via `has_role`). RLS em `subscription_changes` restritiva.
- **Backwards compat**: campos novos em `company_subscriptions` são nullable/têm defaults; assinaturas antigas migram via UPDATE inicial que popula `cycle_start_at = COALESCE(current_period_start, created_at)`.
- **pg_cron**: worker roda hourly. Sem pg_cron disponível, cair para Edge Function agendada externamente.

## Ordem de execução sugerida

1. Bloco 1 (rápido, base para tudo)
2. Bloco 2 (crítico, arruma sua empresa Testando-01)
3. Bloco 3 (fecha o loop no frontend)
4. Bloco 6 (independente, rápido)
5. Bloco 5 (editor de planos)
6. Bloco 4 (instâncias globais)

Aprove pra eu tocar do 1 ao 6, ou diga se quer começar por outro.

# Deploy manual — Fase 2 (Módulo Solicitações)

## 1. SQL
Rodar no SQL Editor do Supabase, nesta ordem:

1. `2026_solicitacoes.sql` — cria tabelas `requests`, `request_comments`, `request_audit_log`, `request_approval_rules`, ENUMs, RLS, GRANTs e helper `user_belongs_to_company`.

> Idempotente: pode ser re-executado.

## 2. Edge Functions
Os 3 arquivos abaixo já estão prontos em `supabase/functions/`. Faça deploy individual:

```bash
supabase functions deploy request-create --no-verify-jwt
supabase functions deploy request-decide --no-verify-jwt
supabase functions deploy request-apply  --no-verify-jwt
```

- **request-create**: cria solicitação de qualquer `request_type`.
- **request-decide**: approve / partial_approve / reject / request_revision / cancel.
- **request-apply**: dispatcher que executa o efeito real após aprovação (ex.: `schedule_change` grava em `employee_schedules`; `absence_request` grava em `employee_absences`).

Para adicionar novo tipo de solicitação no futuro:
1. Frontend cria com novo `request_type` (sem mexer no banco).
2. Adicione um handler em `request-apply/index.ts` (`HANDLERS[novo_tipo]`).
3. (Opcional) registre regra em `request_approval_rules` para definir aprovadores.

## 3. Próximo passo
Quando o SQL estiver rodado e as 3 functions deployadas, me avisa que aplico o frontend do módulo (página `/admin/solicitacoes` com abas Pendentes / Histórico / Configurações + botão "Definir escala" e "Solicitar ausência" usando o motor).

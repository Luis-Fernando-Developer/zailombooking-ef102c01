## Escopo

Refatorar a área do cliente do portal de agendamentos (booking.zailom.com/:slug) para resolver os 6 pontos visuais + os 6 cenários de negócio descritos. Trabalho extenso, por isso peço aprovação antes de tocar no código.

## O que será corrigido

### Bloco A — Header / Sessão (imagens 1 e 2)

1. No header público da empresa (página `/:slug`), o botão "voltar/X" hoje chama `signOut` ou navega para uma rota que invalida a sessão. Corrigir para apenas navegar para a home da empresa SEM deslogar, e exibir o nome/avatar do cliente logado no canto onde hoje aparecem "Entrar / Cadastrar".
2. Quando `client` (sessão) existir → mostrar avatar + nome + menu (Painel do Cliente / Sair). Quando não existir → manter "Entrar / Cadastrar".

### Bloco B — Layout do painel do cliente (imagem 3)

1. Reestruturar `ClientLayout` para:
  ```text
   ┌──────────────────────────────┐
   │ Side   │ Header              │        
   ├         ─────────────────────┤
   │ Side   │ Main                │
   └────────┴─────────────────────┘
  ```
   Header e main fica  ao lado da sidebar.
2. Sidebar passa a exibir a logo da empresa (`company.logo_url`) no topo.
3. Botão "adicionar foto" no Perfil: ligar input file ao Supabase Storage (bucket `client-avatars`), atualizar `clients.avatar_url`, refletir no header/sidebar/dashboard.

### Bloco C — Dashboard (imagem 4)

1. Card de boas-vindas: substituir o círculo verde vazio pelo avatar do cliente (`avatar_url`), com fallback nas iniciais.

### Bloco D — Cards de "Próximos Agendamentos" (imagem 5)

1. Formato da data: `01 de julho de 2026 às 08:00` (date-fns + ptBR, `"dd 'de' MMMM 'de' yyyy 'às' HH:mm"`).
2. Adicionar linha "Profissional: João" (carregar `employees.name` via join).
3. Mesmo formato aplicado para `/agendamentos` (lista completa).

### Bloco E — Regra de edição/reagendamento (imagem 6 + cenários)

Hoje a regra que exibe "Alteração não permitida" considera status financeiro. Nova regra:

```ts
canEdit = bookingDateTime > now
       && !['completed','cancelled','no_show','in_progress'].includes(status)
       && !companyBlocksEdit(booking)  // regra da empresa (janela mínima)
```

- Permitir Reagendar (data/hora/profissional), Trocar serviço, Adicionar serviços extras, Cancelar — desde que o procedimento ainda não tenha ocorrido, independente de pagamento.
- Ao reagendar: liberar slot antigo + reservar novo via função RPC transacional `client_reschedule_booking(...)`.
- Ao trocar profissional: validar `employee_services` + disponibilidade.
- Ao trocar/adicionar serviço: recalcular duração, slot, preço; criar registro de diferença em `payment_adjustments` quando o valor mudar.

### Bloco F — Cenários adicionais detectados (vou implementar também)

- **Cenário 7 — Janela mínima de alteração**: respeitar `companies.min_reschedule_hours` (se a empresa define que precisa de X horas de antecedência, bloquear abaixo disso, com mensagem clara).
- **Cenário 8 — Conflito de concorrência**: dois clientes tentando o mesmo slot → tratar erro de unique constraint e mostrar "Horário acabou de ser reservado".
- **Cenário 9 — Realocação automática (ausência do profissional)**: notificação in-app + tela `/client/realocacao/:id` com 4 ações (aceitar / outro profissional / nova data / cancelar).
- **Cenário 10 — Reembolso parcial**: quando reagendamento reduz valor ou cancelamento gera estorno parcial conforme política.
- **Cenário 11 — Histórico de alterações**: tabela `booking_history` para auditoria.

## Banco de dados — SQL para execução manual no Supabase externo

```sql
-- 1. Storage bucket de avatares de clientes
insert into storage.buckets (id, name, public)
values ('client-avatars', 'client-avatars', true)
on conflict (id) do nothing;

create policy "client avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'client-avatars');

create policy "clients upload own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "clients update own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'client-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- 2. Coluna avatar em clients (se não existir)
alter table public.clients add column if not exists avatar_url text;

-- 3. Política de reagendamento por empresa
alter table public.companies
  add column if not exists min_reschedule_hours integer not null default 2,
  add column if not exists allow_client_reschedule boolean not null default true,
  add column if not exists allow_client_cancel boolean not null default true;

-- 4. Histórico de alterações
create table if not exists public.booking_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  changed_by uuid,
  change_type text not null check (change_type in ('reschedule','service_change','employee_change','cancel','reallocation')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.booking_history to authenticated;
grant all on public.booking_history to service_role;
alter table public.booking_history enable row level security;
create policy "clients read own history"
  on public.booking_history for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and b.client_id = auth.uid()));

-- 5. Diferenças de pagamento
create table if not exists public.payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount_diff numeric(10,2) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','charged','refunded','waived')),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.payment_adjustments to authenticated;
grant all on public.payment_adjustments to service_role;
alter table public.payment_adjustments enable row level security;
create policy "clients read own adjustments"
  on public.payment_adjustments for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and b.client_id = auth.uid()));

-- 6. RPC transacional de reagendamento (libera slot antigo + reserva novo)
create or replace function public.client_reschedule_booking(
  p_booking_id uuid,
  p_new_date date,
  p_new_start time,
  p_new_employee uuid,
  p_new_service uuid
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare v_old public.bookings; v_new public.bookings;
begin
  select * into v_old from bookings where id = p_booking_id and client_id = auth.uid() for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_old.booking_status in ('completed','cancelled','no_show','in_progress') then
    raise exception 'booking_locked';
  end if;
  -- validar conflito
  if exists (
    select 1 from bookings
    where company_id = v_old.company_id
      and employee_id = coalesce(p_new_employee, v_old.employee_id)
      and booking_date = p_new_date
      and booking_status not in ('cancelled','no_show')
      and id <> p_booking_id
      and tstzrange((p_new_date + p_new_start)::timestamptz,
                    (p_new_date + p_new_start + interval '1 minute' * (
                      select coalesce(duration_minutes,30) from services
                       where id = coalesce(p_new_service, v_old.service_id)))::timestamptz, '[)')
        && tstzrange((booking_date + start_time)::timestamptz,
                     (booking_date + end_time)::timestamptz, '[)')
  ) then raise exception 'slot_taken'; end if;

  update bookings set
    booking_date = p_new_date,
    start_time   = p_new_start,
    end_time     = p_new_start + interval '1 minute' * (
                     select coalesce(duration_minutes,30) from services
                      where id = coalesce(p_new_service, v_old.service_id)),
    employee_id  = coalesce(p_new_employee, employee_id),
    service_id   = coalesce(p_new_service,  service_id),
    updated_at   = now()
  where id = p_booking_id
  returning * into v_new;

  insert into booking_history(booking_id, changed_by, change_type, old_data, new_data)
    values (p_booking_id, auth.uid(), 'reschedule', to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end $$;
grant execute on function public.client_reschedule_booking(uuid,date,time,uuid,uuid) to authenticated;
```

Sem Edge Functions novas — toda a lógica vive em RPC do Postgres + cliente.

## Arquivos a alterar/criar (frontend)

- `src/components/public/PublicHeader.tsx` (ou equivalente) — manter sessão, mostrar nome do cliente.
- `src/components/client/ClientLayout.tsx` — reestrutura grid, regra `canEdit`, formato data, profissional, avatar.
- `src/components/client/ClientSidebar.tsx` — logo da empresa, avatar.
- `src/pages/client/Profile.tsx` — upload de avatar funcional.
- `src/pages/client/Dashboard.tsx` — avatar no card de boas-vindas + formato de data nos cards.
- `src/pages/client/Bookings.tsx` — formato de data + profissional + nova regra `canEdit`.
- `src/components/client/ClientRescheduleDialog.tsx` — usar RPC `client_reschedule_booking`, suportar troca de profissional/serviço.
- `src/components/client/ClientCancelDialog.tsx` — respeitar `min_reschedule_hours` e política.
- `src/pages/client/Realocacao.tsx` (novo) — fluxo do Cenário 4.
- `src/lib/bookingRules.ts` (novo) — função pura `canEditBooking(booking, company, now)`.

## Validação

1. `npm run build` limpo.
2. Playwright: login do cliente, abrir `/client/perfil`, fazer upload de avatar, verificar que aparece no header/sidebar/dashboard.
3. Playwright: abrir `/agendamentos`, verificar que agendamento futuro mostra "Reagendar/Cancelar" habilitado e formato `01 de julho de 2026 às 08:00 — Profissional: João`.

## Confirmações que preciso de você antes de começar

1. **Bucket `client-avatars**`: posso criar como público (leitura pública), com upload restrito ao dono? (recomendo sim)
2. **Janela mínima de reagendamento padrão**: 2h ok? (você ajusta depois por empresa)
3. **Reembolso parcial**: implemento só o registro em `payment_adjustments` como `pending` (sem integrar gateway agora) — confirma?
4. **Header público com cliente logado**: mostrar avatar+nome com dropdown "Painel / Sair", ok?

Responda 1-2-3-4 (ou "tudo ok") e eu executo o plano completo de uma vez.  
  
resposta final: tudo ok, pode implementar
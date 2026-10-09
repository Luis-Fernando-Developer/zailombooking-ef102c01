-- =====================================================================
-- 2031 — Client area enhancements
-- Execute manualmente no Supabase do projeto.
--
-- Inclui:
--   1. Bucket de avatares de clientes
--   2. Coluna avatar_url em clients
--   3. Políticas de reagendamento por empresa
--   4. Histórico de alterações de agendamento
--   5. Ajustes financeiros (diferenças de valor)
--   6. RPC transacional client_reschedule_booking
-- =====================================================================

-- 1) Storage bucket
insert into storage.buckets (id, name, public)
values ('client-avatars', 'client-avatars', true)
on conflict (id) do nothing;

drop policy if exists "client avatars are publicly readable" on storage.objects;
create policy "client avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'client-avatars');

drop policy if exists "clients upload own avatar" on storage.objects;
create policy "clients upload own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "clients update own avatar" on storage.objects;
create policy "clients update own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'client-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "clients delete own avatar" on storage.objects;
create policy "clients delete own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- 2) Coluna avatar_url
alter table public.clients add column if not exists avatar_url text;

-- 3) Política de reagendamento por empresa
alter table public.companies
  add column if not exists min_reschedule_hours integer not null default 2,
  add column if not exists allow_client_reschedule boolean not null default true,
  add column if not exists allow_client_cancel boolean not null default true;

-- 4) Histórico de alterações
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
drop policy if exists "clients read own history" on public.booking_history;
create policy "clients read own history"
  on public.booking_history for select to authenticated
  using (exists (
    select 1 from public.bookings b
    join public.clients c on c.id = b.client_id
    where b.id = booking_id and c.user_id = auth.uid()
  ));

-- 5) Ajustes financeiros
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
drop policy if exists "clients read own adjustments" on public.payment_adjustments;
create policy "clients read own adjustments"
  on public.payment_adjustments for select to authenticated
  using (exists (
    select 1 from public.bookings b
    join public.clients c on c.id = b.client_id
    where b.id = booking_id and c.user_id = auth.uid()
  ));

-- 6) RPC de reagendamento (libera slot antigo + reserva novo, atômico)
create or replace function public.client_reschedule_booking(
  p_booking_id uuid,
  p_new_date date,
  p_new_start time,
  p_new_employee uuid default null,
  p_new_service uuid default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_old public.bookings;
  v_new public.bookings;
  v_duration int;
  v_end time;
begin
  select b.* into v_old
  from public.bookings b
  join public.clients c on c.id = b.client_id
  where b.id = p_booking_id and c.user_id = auth.uid()
  for update;

  if not found then raise exception 'booking_not_found'; end if;
  if v_old.booking_status in ('completed','cancelled','no_show','in_progress') then
    raise exception 'booking_locked';
  end if;

  select coalesce(duration_minutes, 30) into v_duration
  from public.services
  where id = coalesce(p_new_service, v_old.service_id);

  v_end := p_new_start + (v_duration || ' minutes')::interval;

  -- Conflito
  if exists (
    select 1 from public.bookings b2
    where b2.company_id = v_old.company_id
      and b2.employee_id = coalesce(p_new_employee, v_old.employee_id)
      and b2.booking_date = p_new_date
      and b2.booking_status not in ('cancelled','no_show')
      and b2.id <> p_booking_id
      and (p_new_start, v_end) overlaps (b2.start_time, b2.end_time)
  ) then
    raise exception 'slot_taken';
  end if;

  update public.bookings set
    booking_date = p_new_date,
    start_time   = p_new_start,
    end_time     = v_end,
    employee_id  = coalesce(p_new_employee, employee_id),
    service_id   = coalesce(p_new_service,  service_id),
    updated_at   = now()
  where id = p_booking_id
  returning * into v_new;

  insert into public.booking_history(booking_id, changed_by, change_type, old_data, new_data)
  values (p_booking_id, auth.uid(), 'reschedule', to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end $$;

grant execute on function public.client_reschedule_booking(uuid, date, time, uuid, uuid) to authenticated;

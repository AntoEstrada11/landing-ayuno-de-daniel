-- Leads / participantes del Ayuno de Daniel
-- Ejecuta esto en Supabase → SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  name text not null,
  email text,
  days jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_phone_unique unique (phone)
);

-- Validaciones (también si la tabla ya existía)
alter table public.leads drop constraint if exists leads_phone_format;
alter table public.leads
  add constraint leads_phone_format check (phone ~ '^[0-9]{10}$');

alter table public.leads drop constraint if exists leads_name_format;
alter table public.leads
  add constraint leads_name_format check (
    char_length(name) between 2 and 60
    and name ~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+([ ''-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$'
  );

create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_updated_at_idx on public.leads (updated_at desc);

alter table public.leads enable row level security;

-- Políticas para la anon key (landing pública).
-- Más adelante conviene endurecer con OTP.
drop policy if exists "leads_insert_anon" on public.leads;
create policy "leads_insert_anon"
  on public.leads for insert
  to anon
  with check (true);

drop policy if exists "leads_select_anon" on public.leads;
create policy "leads_select_anon"
  on public.leads for select
  to anon
  using (true);

drop policy if exists "leads_update_anon" on public.leads;
create policy "leads_update_anon"
  on public.leads for update
  to anon
  using (true)
  with check (true);

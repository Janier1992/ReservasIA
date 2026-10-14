-- ============================================================
-- Stub mínimo de lo que InsForge provee por fuera de nuestras migraciones
-- (roles, auth.users, auth.uid(), system.update_updated_at(), storage), para
-- poder aplicar TODAS las migraciones sobre un Postgres vacío en CI y correr
-- los tests de RLS. Solo para tests: nunca se aplica a un proyecto real.
--
-- auth.uid() lee request.jwt.claim.sub, igual que en InsForge, así los
-- tests simulan un usuario con `set local request.jwt.claim.sub = '<uuid>'`.
-- ============================================================
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  -- Rol de la clave admin del compute service (sin superusuario, igual que en InsForge).
  if not exists (select 1 from pg_roles where rolname = 'project_admin') then create role project_admin nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists system;
create schema if not exists storage;
grant usage on schema auth, system, storage to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;

create or replace function system.update_updated_at() returns trigger
language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;

create table if not exists storage.buckets (
  name text primary key,
  public boolean default false,
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket text references storage.buckets(name),
  key text,
  uploaded_by uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

-- Realtime de InsForge (copia mínima de su migración 017 + 053): canales,
-- mensajes, realtime.publish() y realtime.channel_name() para las políticas.
create schema if not exists realtime;
create table if not exists realtime.channels (
  id uuid default gen_random_uuid() primary key,
  pattern text unique not null,
  description text,
  webhook_urls text[],
  enabled boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists realtime.messages (
  id uuid default gen_random_uuid() primary key,
  event_name text not null,
  channel_id uuid references realtime.channels(id) on delete set null,
  channel_name text not null,
  payload jsonb default '{}'::jsonb not null,
  sender_type text default 'system' not null,
  sender_id uuid,
  created_at timestamptz default now()
);
create or replace function realtime.channel_name() returns text
language sql stable
as $$ select nullif(current_setting('realtime.channel_name', true), '') $$;
create or replace function realtime.publish(p_channel_name text, p_event_name text, p_payload jsonb)
returns uuid
language plpgsql security definer
as $$
declare
  v_channel_id uuid;
  v_message_id uuid;
begin
  select id into v_channel_id from realtime.channels
  where enabled = true and (pattern = p_channel_name or p_channel_name like pattern)
  order by pattern = p_channel_name desc limit 1;
  if v_channel_id is null then
    raise warning 'Realtime: No matching channel found for "%"', p_channel_name;
    return null;
  end if;
  insert into realtime.messages (event_name, channel_id, channel_name, payload, sender_type)
  values (p_event_name, v_channel_id, p_channel_name, p_payload, 'system')
  returning id into v_message_id;
  return v_message_id;
end;
$$;
revoke all on function realtime.publish(text, text, jsonb) from public;
grant usage on schema realtime to authenticated, anon;
grant select on realtime.channels to authenticated, anon;
grant insert on realtime.messages to authenticated, anon;
grant execute on function realtime.channel_name() to authenticated, anon;

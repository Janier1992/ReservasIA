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

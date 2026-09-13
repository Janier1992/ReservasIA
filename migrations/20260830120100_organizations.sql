-- ============================================================
-- organizations: cada fila es un tenant/negocio
--
-- Las RLS policies de esta tabla viven en
-- 20260830120260_organizations-policies.sql (después de crear las
-- funciones auxiliares en 20260830120250_rls-helpers.sql).
-- ============================================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  business_type text not null default 'other',
  status text not null default 'active',
  timezone text not null default 'America/Bogota',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_status_check check (status in ('active', 'suspended', 'cancelled')),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists idx_organizations_slug on public.organizations (slug);

alter table public.organizations enable row level security;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function system.update_updated_at();

grant usage on schema public to anon, authenticated;

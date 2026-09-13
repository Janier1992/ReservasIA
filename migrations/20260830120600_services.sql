-- ============================================================
-- services: catálogo de servicios ofrecidos por la organización
-- ============================================================
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  description text,

  duration_minutes integer not null,
  price numeric(12, 2),

  currency text not null default 'USD',

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_duration_check check (duration_minutes > 0),
  constraint services_price_check check (price is null or price >= 0)
);

create index if not exists idx_services_org on public.services (organization_id);
create index if not exists idx_services_org_active on public.services (organization_id, is_active);

alter table public.services enable row level security;

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
  before update on public.services
  for each row execute function system.update_updated_at();

create policy "services_select_member"
  on public.services for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "services_insert_admin"
  on public.services for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id));

create policy "services_update_admin"
  on public.services for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

create policy "services_delete_admin"
  on public.services for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.services to authenticated;

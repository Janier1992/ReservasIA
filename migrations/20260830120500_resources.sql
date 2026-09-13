-- ============================================================
-- resources: unidad reservable genérica (mesa, barbero, consultorio, ...)
-- ============================================================
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  description text,

  resource_type text,
  capacity integer not null default 1,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resources_capacity_check check (capacity > 0)
);

create index if not exists idx_resources_org on public.resources (organization_id);
create index if not exists idx_resources_org_active on public.resources (organization_id, is_active);

alter table public.resources enable row level security;

drop trigger if exists trg_resources_updated_at on public.resources;
create trigger trg_resources_updated_at
  before update on public.resources
  for each row execute function system.update_updated_at();

create policy "resources_select_member"
  on public.resources for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "resources_insert_admin"
  on public.resources for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id));

create policy "resources_update_admin"
  on public.resources for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

create policy "resources_delete_admin"
  on public.resources for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.resources to authenticated;

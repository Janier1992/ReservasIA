-- ============================================================
-- customers: clientes finales del negocio (aislados por organización)
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  phone text,
  name text,
  email text,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un mismo teléfono puede repetirse entre organizaciones distintas, pero no
-- dentro de la misma organización (identificación por org + teléfono desde WhatsApp).
create unique index if not exists uq_customers_org_phone
  on public.customers (organization_id, phone)
  where phone is not null;

create index if not exists idx_customers_org on public.customers (organization_id);
create index if not exists idx_customers_org_phone on public.customers (organization_id, phone);

alter table public.customers enable row level security;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function system.update_updated_at();

create policy "customers_select_member"
  on public.customers for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "customers_insert_member"
  on public.customers for insert
  to authenticated
  with check (public.is_org_member(organization_id));

create policy "customers_update_member"
  on public.customers for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "customers_delete_admin"
  on public.customers for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.customers to authenticated;

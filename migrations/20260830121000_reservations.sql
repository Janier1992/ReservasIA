-- ============================================================
-- reservations
-- ============================================================
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references public.organizations(id) on delete cascade,

  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  resource_id uuid references public.resources(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,

  start_at timestamptz not null,
  end_at timestamptz not null,

  party_size integer,

  customer_name text,

  special_requests text,

  status text not null default 'confirmed',

  source text not null default 'whatsapp',

  external_reference text,

  google_event_id text,

  internal_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reservations_status_check check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  constraint reservations_time_check check (end_at > start_at),
  constraint reservations_party_size_check check (party_size is null or party_size > 0)
);

create index if not exists idx_reservations_org_start on public.reservations (organization_id, start_at);
create index if not exists idx_reservations_org_status on public.reservations (organization_id, status);
create index if not exists idx_reservations_customer on public.reservations (customer_id);
create index if not exists idx_reservations_resource_start on public.reservations (resource_id, start_at);

alter table public.reservations enable row level security;

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
  before update on public.reservations
  for each row execute function system.update_updated_at();

-- ============================================================
-- Prevención de doble reserva a nivel de base de datos.
--
-- Un EXCLUDE constraint garantiza, incluso bajo transacciones concurrentes,
-- que no puedan coexistir dos reservas activas (pending/confirmed) para el
-- mismo recurso con rangos de tiempo solapados. Esto es más fuerte que
-- cualquier chequeo SELECT -> INSERT hecho en aplicación, porque Postgres
-- lo valida atómicamente como parte del propio INSERT/UPDATE.
-- ============================================================
alter table public.reservations
  add constraint reservations_no_overlap_per_resource
  exclude using gist (
    organization_id with =,
    resource_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (resource_id is not null and status in ('pending', 'confirmed'));

create policy "reservations_select_member"
  on public.reservations for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "reservations_insert_member"
  on public.reservations for insert
  to authenticated
  with check (public.is_org_member(organization_id));

create policy "reservations_update_member"
  on public.reservations for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "reservations_delete_admin"
  on public.reservations for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.reservations to authenticated;

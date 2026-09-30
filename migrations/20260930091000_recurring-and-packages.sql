-- ============================================================
-- Reservas recurrentes (clases semanales) y paquetes multi-sesión.
--
-- Reservas recurrentes: crear_reserva puede pedir varias semanas seguidas
-- del mismo horario (típico de academias/gimnasios). Cada ocurrencia es una
-- fila normal en reservations, pasa por las mismas validaciones de
-- disponibilidad/capacidad una por una; solo comparten recurrence_group_id
-- para poder identificarlas como una misma serie.
--
-- Paquetes multi-sesión: un negocio (ej. fisioterapia, odontología) puede
-- vender un paquete de N sesiones de un servicio. Las sesiones usadas NUNCA
-- se guardan como contador aparte (evita que se desincronice con
-- cancelaciones): se calculan siempre contando las reservas no canceladas
-- vinculadas a customer_packages.id vía reservations.customer_package_id.
-- ============================================================

alter table public.reservations
  add column if not exists recurrence_group_id uuid,
  add column if not exists customer_package_id uuid;

create index if not exists idx_reservations_recurrence_group
  on public.reservations (recurrence_group_id)
  where recurrence_group_id is not null;

-- ------------------------------------------------------------
-- service_packages: catálogo de paquetes que el negocio ofrece (ej. "10
-- sesiones de fisioterapia"). Se gestiona como los servicios: solo
-- admin/owner lo define, cualquier miembro lo puede consultar.
-- ------------------------------------------------------------
create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,

  name text not null,
  total_sessions integer not null,
  price numeric(12, 2),
  currency text not null default 'USD',

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_packages_sessions_check check (total_sessions > 0),
  constraint service_packages_price_check check (price is null or price >= 0)
);

create index if not exists idx_service_packages_org on public.service_packages (organization_id);
create index if not exists idx_service_packages_org_active on public.service_packages (organization_id, is_active);

alter table public.service_packages enable row level security;

drop trigger if exists trg_service_packages_updated_at on public.service_packages;
create trigger trg_service_packages_updated_at
  before update on public.service_packages
  for each row execute function system.update_updated_at();

create policy "service_packages_select_member"
  on public.service_packages for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "service_packages_insert_admin"
  on public.service_packages for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id));

create policy "service_packages_update_admin"
  on public.service_packages for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

create policy "service_packages_delete_admin"
  on public.service_packages for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.service_packages to authenticated;

-- ------------------------------------------------------------
-- customer_packages: una instancia comprada por un cliente puntual. Guarda
-- su propia copia de nombre/sesiones/precio (snapshot al momento de la
-- venta) para que cambios posteriores al catálogo (o su borrado) no alteren
-- paquetes ya vendidos.
-- ------------------------------------------------------------
create table if not exists public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  package_id uuid references public.service_packages(id) on delete set null,

  package_name text not null,
  sessions_total integer not null,
  price numeric(12, 2),
  currency text not null default 'USD',

  status text not null default 'active',

  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_packages_sessions_check check (sessions_total > 0),
  constraint customer_packages_status_check check (status in ('active', 'completed', 'cancelled'))
);

create index if not exists idx_customer_packages_org on public.customer_packages (organization_id);
create index if not exists idx_customer_packages_customer on public.customer_packages (customer_id);

alter table public.customer_packages enable row level security;

drop trigger if exists trg_customer_packages_updated_at on public.customer_packages;
create trigger trg_customer_packages_updated_at
  before update on public.customer_packages
  for each row execute function system.update_updated_at();

create policy "customer_packages_select_member"
  on public.customer_packages for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "customer_packages_insert_member"
  on public.customer_packages for insert
  to authenticated
  with check (public.is_org_member(organization_id));

create policy "customer_packages_update_member"
  on public.customer_packages for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "customer_packages_delete_admin"
  on public.customer_packages for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.customer_packages to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_customer_package_fk') then
    alter table public.reservations
      add constraint reservations_customer_package_fk
      foreign key (customer_package_id) references public.customer_packages(id) on delete set null;
  end if;
end $$;

create index if not exists idx_reservations_customer_package
  on public.reservations (customer_package_id)
  where customer_package_id is not null;

-- ------------------------------------------------------------
-- book_reservation: se agregan p_recurrence_group_id y p_customer_package_id
-- al final (con default null) para no romper ningún llamador existente.
-- Se dropea la versión vieja primero porque Postgres no reemplaza una
-- función si cambia la cantidad de parámetros: sin el drop quedarían dos
-- overloads del mismo nombre, y una llamada que solo pasa los primeros 11
-- parámetros sería ambigua.
-- ------------------------------------------------------------
drop function if exists public.book_reservation(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text
);

create or replace function public.book_reservation(
  p_organization_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_resource_id uuid,
  p_conversation_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_party_size integer,
  p_customer_name text,
  p_special_requests text,
  p_source text default 'whatsapp',
  p_recurrence_group_id uuid default null,
  p_customer_package_id uuid default null
)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_reservation public.reservations;
  v_capacity integer;
  v_used_capacity integer;
  v_lock_key bigint;
  v_package public.customer_packages;
  v_sessions_used integer;
begin
  if (select auth.uid()) is not null and not public.is_org_member(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_service_id is not null and not exists (
    select 1 from public.services where id = p_service_id and organization_id = p_organization_id
  ) then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_resource_id is not null and not exists (
    select 1 from public.resources where id = p_resource_id and organization_id = p_organization_id
  ) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_end_at <= p_start_at then
    raise exception 'RESERVATION_INVALID_RANGE' using errcode = 'P0001';
  end if;

  if p_start_at < now() then
    raise exception 'RESERVATION_IN_PAST' using errcode = 'P0001';
  end if;

  if p_customer_package_id is not null then
    select * into v_package from public.customer_packages where id = p_customer_package_id for update;
    if not found or v_package.organization_id <> p_organization_id or v_package.customer_id <> p_customer_id then
      raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_package.status <> 'active' then
      raise exception 'PACKAGE_NOT_ACTIVE' using errcode = 'P0001';
    end if;

    select count(*) into v_sessions_used
    from public.reservations
    where customer_package_id = p_customer_package_id
      and status <> 'cancelled';

    if v_sessions_used >= v_package.sessions_total then
      raise exception 'PACKAGE_EXHAUSTED' using errcode = 'P0001';
    end if;
  end if;

  -- Serializa reservas concurrentes del mismo día/organización. El caso de
  -- resource_id específico además queda protegido de forma atómica por el
  -- EXCLUDE constraint de la propia tabla reservations.
  v_lock_key := hashtextextended(p_organization_id::text || ':' || date_trunc('day', p_start_at)::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if p_resource_id is null then
    select capacity_total into v_capacity
    from public.business_profiles
    where organization_id = p_organization_id;

    if v_capacity is not null then
      select coalesce(sum(coalesce(party_size, 1)), 0) into v_used_capacity
      from public.reservations
      where organization_id = p_organization_id
        and status in ('pending', 'confirmed')
        and resource_id is null
        and tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)');

      if v_used_capacity + coalesce(p_party_size, 1) > v_capacity then
        raise exception 'RESERVATION_NOT_AVAILABLE' using errcode = 'P0001';
      end if;
    end if;
  end if;

  begin
    insert into public.reservations (
      organization_id, customer_id, service_id, resource_id, conversation_id,
      start_at, end_at, party_size, customer_name, special_requests, source, status,
      recurrence_group_id, customer_package_id
    ) values (
      p_organization_id, p_customer_id, p_service_id, p_resource_id, p_conversation_id,
      p_start_at, p_end_at, p_party_size, p_customer_name, p_special_requests, coalesce(p_source, 'whatsapp'), 'confirmed',
      p_recurrence_group_id, p_customer_package_id
    )
    returning * into v_reservation;
  exception
    when exclusion_violation then
      raise exception 'RESERVATION_NOT_AVAILABLE' using errcode = 'P0001';
  end;

  return v_reservation;
end;
$$;

grant execute on function public.book_reservation(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, uuid, uuid
) to authenticated;

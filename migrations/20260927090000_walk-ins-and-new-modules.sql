-- ============================================================
-- Módulos nuevos: "Atención en sitio" (walk_ins) y "Reportes" (reports).
--
-- Atención en sitio es la fila de clientes que llegan al negocio sin cita
-- (lavaderos, talleres, barberías). Cada llegada queda en walk_ins; al
-- pasarla a atención se crea una reserva real (source 'walk_in') con
-- book_reservation, así respeta la disponibilidad del recurso y queda en
-- el historial, los reportes y la ficha del cliente como cualquier otra.
--
-- Los dos módulos arrancan APAGADOS: soporte los activa por negocio.
-- ============================================================

-- ------------------------------------------------------------
-- Claves nuevas en el catálogo de módulos y apagadas por defecto.
-- ------------------------------------------------------------
alter table public.organizations
  drop constraint if exists organizations_disabled_modules_known;
alter table public.organizations
  add constraint organizations_disabled_modules_known
  check (disabled_modules <@ array['inbox', 'customers', 'services', 'resources', 'agent', 'integrations', 'team', 'walk_ins', 'reports']::text[]);

alter table public.organizations
  alter column disabled_modules set default array['walk_ins', 'reports']::text[];

-- Negocios existentes: los módulos nuevos se apagan UNA sola vez. La tabla
-- module_defaults_applied recuerda que ya se hizo, así volver a correr esta
-- migración no apaga lo que soporte haya activado después.
create table if not exists public.module_defaults_applied (
  module_key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.module_defaults_applied enable row level security;

do $$
begin
  if not exists (select 1 from public.module_defaults_applied where module_key = 'walk_ins') then
    update public.organizations
      set disabled_modules = array_append(disabled_modules, 'walk_ins')
      where not ('walk_ins' = any (disabled_modules));
    insert into public.module_defaults_applied (module_key) values ('walk_ins');
  end if;

  if not exists (select 1 from public.module_defaults_applied where module_key = 'reports') then
    update public.organizations
      set disabled_modules = array_append(disabled_modules, 'reports')
      where not ('reports' = any (disabled_modules));
    insert into public.module_defaults_applied (module_key) values ('reports');
  end if;
end;
$$;

-- ------------------------------------------------------------
-- walk_ins: fila de llegadas sin cita.
-- ------------------------------------------------------------
create table if not exists public.walk_ins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  service_id uuid references public.services(id) on delete set null,
  notes text,
  status text not null default 'waiting',
  reservation_id uuid references public.reservations(id) on delete set null,
  arrived_at timestamptz not null default now(),
  served_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint walk_ins_status_check check (status in ('waiting', 'in_service', 'done', 'left')),
  constraint walk_ins_name_check check (length(trim(customer_name)) > 0)
);

create index if not exists idx_walk_ins_org_status on public.walk_ins (organization_id, status, arrived_at);
create index if not exists idx_walk_ins_org_arrived on public.walk_ins (organization_id, arrived_at);

alter table public.walk_ins enable row level security;

drop trigger if exists trg_walk_ins_updated_at on public.walk_ins;
create trigger trg_walk_ins_updated_at
  before update on public.walk_ins
  for each row execute function system.update_updated_at();

drop policy if exists "walk_ins_select_member" on public.walk_ins;
create policy "walk_ins_select_member"
  on public.walk_ins for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "walk_ins_insert_member" on public.walk_ins;
create policy "walk_ins_insert_member"
  on public.walk_ins for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "walk_ins_update_member" on public.walk_ins;
create policy "walk_ins_update_member"
  on public.walk_ins for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "walk_ins_delete_admin" on public.walk_ins;
create policy "walk_ins_delete_admin"
  on public.walk_ins for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

drop policy if exists "walk_ins_select_support" on public.walk_ins;
create policy "walk_ins_select_support"
  on public.walk_ins for select
  to authenticated
  using (public.is_support_staff());

grant select, insert, update, delete on public.walk_ins to authenticated;

-- ------------------------------------------------------------
-- serve_walk_in: pasa una llegada a atención. Vincula (o crea) el cliente
-- por teléfono y crea la reserva desde "ahora" por la duración del
-- servicio (30 min si no tiene), usando book_reservation para que un
-- recurso ocupado devuelva RESERVATION_NOT_AVAILABLE en vez de pisarse.
-- `now()` es el mismo en toda la transacción, así que no choca con el
-- chequeo de "reserva en el pasado" de book_reservation.
-- ------------------------------------------------------------
create or replace function public.serve_walk_in(p_walk_in_id uuid, p_resource_id uuid default null)
returns public.walk_ins
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_walk_in public.walk_ins;
  v_customer_id uuid;
  v_duration integer;
  v_reservation public.reservations;
begin
  select * into v_walk_in from public.walk_ins where id = p_walk_in_id for update;
  if not found then
    raise exception 'WALK_IN_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.is_org_member(v_walk_in.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_walk_in.status <> 'waiting' then
    raise exception 'WALK_IN_NOT_WAITING' using errcode = 'P0001';
  end if;

  v_customer_id := v_walk_in.customer_id;
  if v_customer_id is null and nullif(trim(v_walk_in.customer_phone), '') is not null then
    insert into public.customers (organization_id, phone, name)
      values (v_walk_in.organization_id, trim(v_walk_in.customer_phone), v_walk_in.customer_name)
      on conflict (organization_id, phone) where phone is not null
      do update set name = coalesce(public.customers.name, excluded.name)
      returning id into v_customer_id;
  end if;

  select coalesce(duration_minutes, 30) into v_duration
    from public.services
    where id = v_walk_in.service_id and organization_id = v_walk_in.organization_id;
  v_duration := coalesce(v_duration, 30);

  v_reservation := public.book_reservation(
    v_walk_in.organization_id,
    v_customer_id,
    v_walk_in.service_id,
    p_resource_id,
    null,
    now(),
    now() + make_interval(mins => v_duration),
    null,
    v_walk_in.customer_name,
    v_walk_in.notes,
    'walk_in'
  );

  update public.walk_ins
    set status = 'in_service',
        customer_id = v_customer_id,
        reservation_id = v_reservation.id,
        served_at = now()
    where id = p_walk_in_id
    returning * into v_walk_in;

  return v_walk_in;
end;
$$;

grant execute on function public.serve_walk_in(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- finish_walk_in: termina la atención. La reserva pasa a "completed" y su
-- fin se ajusta a la hora real (si terminó antes, el recurso queda libre
-- para el siguiente; nunca antes de su inicio).
-- ------------------------------------------------------------
create or replace function public.finish_walk_in(p_walk_in_id uuid)
returns public.walk_ins
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_walk_in public.walk_ins;
begin
  select * into v_walk_in from public.walk_ins where id = p_walk_in_id for update;
  if not found then
    raise exception 'WALK_IN_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.is_org_member(v_walk_in.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_walk_in.status <> 'in_service' then
    raise exception 'WALK_IN_NOT_IN_SERVICE' using errcode = 'P0001';
  end if;

  if v_walk_in.reservation_id is not null then
    update public.reservations
      set status = 'completed',
          end_at = greatest(now(), start_at + interval '1 minute')
      where id = v_walk_in.reservation_id
        and status in ('pending', 'confirmed');
  end if;

  update public.walk_ins
    set status = 'done', finished_at = now()
    where id = p_walk_in_id
    returning * into v_walk_in;

  return v_walk_in;
end;
$$;

grant execute on function public.finish_walk_in(uuid) to authenticated;

-- ============================================================
-- Fase 4: horario propio por recurso y bloqueos de agenda.
--
-- resource_hour_periods  horario semanal de un recurso (barbero, bahía,
--                        consultorio). Si un recurso NO tiene filas, trabaja
--                        en el horario del negocio; si tiene, solo en esas
--                        franjas (los días sin filas no trabaja). Lo usa el
--                        motor de disponibilidad (agente y página pública).
-- schedule_blocks        franjas bloqueadas: vacaciones, almuerzo, festivo,
--                        mantenimiento. Con resource_id = solo ese recurso;
--                        sin resource_id = todo el negocio. A diferencia del
--                        horario, un bloqueo es una regla dura: la base
--                        rechaza cualquier reserva nueva que lo pise
--                        (TIME_BLOCKED), venga del agente, la página
--                        pública, el panel o la atención en sitio.
-- ============================================================

-- ------------------------------------------------------------
-- Horario por recurso
-- ------------------------------------------------------------
create table if not exists public.resource_hour_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  day_of_week integer not null,
  opening_time time not null,
  closing_time time not null,
  created_at timestamptz not null default now(),
  constraint resource_hour_periods_dow_check check (day_of_week between 0 and 6),
  constraint resource_hour_periods_time_check check (closing_time > opening_time)
);

create index if not exists idx_resource_hour_periods_resource on public.resource_hour_periods (organization_id, resource_id, day_of_week);

create or replace function public.check_resource_hour_period_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (select 1 from public.resources where id = new.resource_id and organization_id = new.organization_id) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_resource_hour_period_tenant on public.resource_hour_periods;
create trigger trg_check_resource_hour_period_tenant
  before insert or update on public.resource_hour_periods
  for each row execute function public.check_resource_hour_period_tenant();

alter table public.resource_hour_periods enable row level security;

drop policy if exists "resource_hours_select_member" on public.resource_hour_periods;
create policy "resource_hours_select_member" on public.resource_hour_periods for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "resource_hours_write_admin" on public.resource_hour_periods;
create policy "resource_hours_write_admin" on public.resource_hour_periods for all to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));
drop policy if exists "resource_hours_select_support" on public.resource_hour_periods;
create policy "resource_hours_select_support" on public.resource_hour_periods for select to authenticated
  using (public.is_support_staff());

grant select, insert, update, delete on public.resource_hour_periods to authenticated;

-- ------------------------------------------------------------
-- Bloqueos de agenda
-- ------------------------------------------------------------
create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint schedule_blocks_range_check check (ends_at > starts_at),
  constraint schedule_blocks_length_check check (ends_at - starts_at <= interval '366 days'),
  constraint schedule_blocks_reason_check check (reason is null or length(reason) <= 120)
);

create index if not exists idx_schedule_blocks_org_range on public.schedule_blocks (organization_id, starts_at, ends_at);

create or replace function public.check_schedule_block_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.resource_id is not null and not exists (
    select 1 from public.resources where id = new.resource_id and organization_id = new.organization_id
  ) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_schedule_block_tenant on public.schedule_blocks;
create trigger trg_check_schedule_block_tenant
  before insert or update on public.schedule_blocks
  for each row execute function public.check_schedule_block_tenant();

alter table public.schedule_blocks enable row level security;

-- Cualquiera del equipo puede bloquear (ej. su almuerzo); borrar, solo
-- owner/admin o quien creó el bloqueo.
drop policy if exists "schedule_blocks_select_member" on public.schedule_blocks;
create policy "schedule_blocks_select_member" on public.schedule_blocks for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "schedule_blocks_insert_member" on public.schedule_blocks;
create policy "schedule_blocks_insert_member" on public.schedule_blocks for insert to authenticated
  with check (public.is_org_member(organization_id) and created_by = (select auth.uid()));
drop policy if exists "schedule_blocks_delete_admin_or_creator" on public.schedule_blocks;
create policy "schedule_blocks_delete_admin_or_creator" on public.schedule_blocks for delete to authenticated
  using (
    public.is_org_admin_or_owner(organization_id)
    or (public.is_org_member(organization_id) and created_by = (select auth.uid()))
  );
drop policy if exists "schedule_blocks_select_support" on public.schedule_blocks;
create policy "schedule_blocks_select_support" on public.schedule_blocks for select to authenticated
  using (public.is_support_staff());

-- Sin UPDATE: un bloqueo se borra y se vuelve a crear.
grant select, insert, delete on public.schedule_blocks to authenticated;

-- ------------------------------------------------------------
-- Ninguna reserva activa nueva (o movida) puede pisar un bloqueo.
-- Las reservas que ya existían cuando se creó el bloqueo no se tocan: el
-- panel avisa cuántas hay para que el negocio las reprograme.
-- ------------------------------------------------------------
create or replace function public.check_reservation_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.start_at = old.start_at
     and new.end_at = old.end_at
     and new.resource_id is not distinct from old.resource_id then
    return new;
  end if;
  if exists (
    select 1 from public.schedule_blocks b
    where b.organization_id = new.organization_id
      and (b.resource_id is null or b.resource_id = new.resource_id)
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.start_at, new.end_at, '[)')
  ) then
    raise exception 'TIME_BLOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_reservation_not_blocked on public.reservations;
create trigger trg_check_reservation_not_blocked
  before insert or update of start_at, end_at, resource_id on public.reservations
  for each row execute function public.check_reservation_not_blocked();

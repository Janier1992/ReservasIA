-- ============================================================
-- business_hour_periods: bloques horarios por día de la semana.
-- Reemplaza a un simple "business_hours" de un solo rango por día para
-- soportar horarios partidos (ej. 12:00-15:30 y 19:30-23:30).
-- day_of_week: 0=domingo ... 6=sábado.
-- ============================================================
create table if not exists public.business_hour_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  day_of_week integer not null,
  is_closed boolean not null default false,

  opening_time time,
  closing_time time,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_hour_periods_dow_check check (day_of_week between 0 and 6),
  constraint business_hour_periods_time_check check (
    is_closed = true
    or (opening_time is not null and closing_time is not null and closing_time > opening_time)
  )
);

create index if not exists idx_business_hour_periods_org_dow
  on public.business_hour_periods (organization_id, day_of_week);

alter table public.business_hour_periods enable row level security;

drop trigger if exists trg_business_hour_periods_updated_at on public.business_hour_periods;
create trigger trg_business_hour_periods_updated_at
  before update on public.business_hour_periods
  for each row execute function system.update_updated_at();

create policy "business_hours_select_member"
  on public.business_hour_periods for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "business_hours_insert_admin"
  on public.business_hour_periods for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id));

create policy "business_hours_update_admin"
  on public.business_hour_periods for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

create policy "business_hours_delete_admin"
  on public.business_hour_periods for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.business_hour_periods to authenticated;

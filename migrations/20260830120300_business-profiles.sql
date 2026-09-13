-- ============================================================
-- business_profiles: información pública / operativa del negocio
-- ============================================================
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,

  name text not null,
  description text,
  address text,
  phone text,
  email text,
  website text,

  business_type text,
  category text,

  currency text not null default 'USD',
  timezone text not null,

  capacity_total integer,
  reservation_duration_minutes integer not null default 60,
  slot_interval_minutes integer not null default 30,

  advance_booking_hours integer not null default 1,
  max_booking_days integer not null default 60,

  cancellation_policy text,
  special_instructions text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_profiles_capacity_check check (capacity_total is null or capacity_total > 0),
  constraint business_profiles_duration_check check (reservation_duration_minutes > 0),
  constraint business_profiles_slot_check check (slot_interval_minutes > 0),
  constraint business_profiles_advance_check check (advance_booking_hours >= 0),
  constraint business_profiles_max_days_check check (max_booking_days > 0)
);

alter table public.business_profiles enable row level security;

drop trigger if exists trg_business_profiles_updated_at on public.business_profiles;
create trigger trg_business_profiles_updated_at
  before update on public.business_profiles
  for each row execute function system.update_updated_at();

create policy "business_profiles_select_member"
  on public.business_profiles for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "business_profiles_insert_admin"
  on public.business_profiles for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id));

create policy "business_profiles_update_admin"
  on public.business_profiles for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

create policy "business_profiles_delete_owner"
  on public.business_profiles for delete
  to authenticated
  using (public.is_org_owner(organization_id));

grant select, insert, update, delete on public.business_profiles to authenticated;

-- ============================================================
-- Fase 2 de funcionalidades por rubro:
--
-- 1. Fichas (customer_assets): lo que el cliente trae o lo que se atiende,
--    con campos según el rubro — vehículo (taller, lavadero), mascota
--    (veterinaria), preferencias (salón, barbería, spa), estudiante o
--    miembro (academia, gimnasio). Los campos propios de cada tipo van en
--    `attributes` (jsonb); el catálogo de campos vive en
--    app/src/lib/assetTypes.ts. Una reserva puede apuntar a una ficha.
-- 2. Etapas (reservations.stage): el flujo propio de cada rubro además del
--    estado de la reserva (ej. taller: recibido → diagnóstico → ... →
--    listo para entregar). La lista de etapas por rubro vive en
--    app/src/lib/workflows.ts; acá solo se guarda la clave.
-- 3. Módulos nuevos: public_booking (página pública de reservas, arranca
--    APAGADO), assets y workflow (arrancan encendidos: solo se ven en los
--    rubros que definen fichas o etapas).
-- ============================================================

-- ------------------------------------------------------------
-- Módulos
-- ------------------------------------------------------------
alter table public.organizations
  drop constraint if exists organizations_disabled_modules_known;
alter table public.organizations
  add constraint organizations_disabled_modules_known
  check (disabled_modules <@ array[
    'inbox', 'customers', 'services', 'resources', 'agent', 'integrations', 'team',
    'walk_ins', 'reports', 'public_booking', 'assets', 'workflow'
  ]::text[]);

alter table public.organizations
  alter column disabled_modules set default array['walk_ins', 'reports', 'public_booking']::text[];

do $$
begin
  if not exists (select 1 from public.module_defaults_applied where module_key = 'public_booking') then
    update public.organizations
      set disabled_modules = array_append(disabled_modules, 'public_booking')
      where not ('public_booking' = any (disabled_modules));
    insert into public.module_defaults_applied (module_key) values ('public_booking');
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Fichas
-- ------------------------------------------------------------
create table if not exists public.customer_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  asset_type text not null,
  label text not null,
  attributes jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_assets_type_check check (asset_type in ('vehicle', 'pet', 'preferences', 'student')),
  constraint customer_assets_label_check check (length(trim(label)) between 1 and 80),
  constraint customer_assets_attributes_object check (jsonb_typeof(attributes) = 'object')
);

create index if not exists idx_customer_assets_org_customer on public.customer_assets (organization_id, customer_id);

-- Una placa identifica un solo vehículo dentro del negocio: permite buscar
-- "¿ya vino este carro?" y evita fichas duplicadas por mayúsculas/espacios.
create unique index if not exists uq_customer_assets_vehicle_plate
  on public.customer_assets (organization_id, upper(regexp_replace(label, '\s', '', 'g')))
  where asset_type = 'vehicle';

-- La ficha tiene que ser del mismo negocio que el cliente (las FKs solas no
-- lo garantizan: un customer_id de otro negocio existe igual en la tabla).
create or replace function public.check_customer_asset_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.customers
    where id = new.customer_id and organization_id = new.organization_id
  ) then
    raise exception 'ASSET_CUSTOMER_MISMATCH' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_customer_asset_tenant on public.customer_assets;
create trigger trg_check_customer_asset_tenant
  before insert or update of customer_id, organization_id on public.customer_assets
  for each row execute function public.check_customer_asset_tenant();

drop trigger if exists trg_customer_assets_updated_at on public.customer_assets;
create trigger trg_customer_assets_updated_at
  before update on public.customer_assets
  for each row execute function system.update_updated_at();

alter table public.customer_assets enable row level security;

drop policy if exists "customer_assets_select_member" on public.customer_assets;
create policy "customer_assets_select_member" on public.customer_assets for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "customer_assets_insert_member" on public.customer_assets;
create policy "customer_assets_insert_member" on public.customer_assets for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "customer_assets_update_member" on public.customer_assets;
create policy "customer_assets_update_member" on public.customer_assets for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "customer_assets_delete_admin" on public.customer_assets;
create policy "customer_assets_delete_admin" on public.customer_assets for delete to authenticated
  using (public.is_org_admin_or_owner(organization_id));

drop policy if exists "customer_assets_select_support" on public.customer_assets;
create policy "customer_assets_select_support" on public.customer_assets for select to authenticated
  using (public.is_support_staff());

grant select, insert, update, delete on public.customer_assets to authenticated;

-- ------------------------------------------------------------
-- Reservas: ficha vinculada y etapa
-- ------------------------------------------------------------
alter table public.reservations
  add column if not exists asset_id uuid references public.customer_assets(id) on delete set null,
  add column if not exists stage text,
  add column if not exists stage_updated_at timestamptz;

alter table public.reservations
  drop constraint if exists reservations_stage_format;
alter table public.reservations
  add constraint reservations_stage_format check (stage is null or stage ~ '^[a-z_]{1,40}$');

create index if not exists idx_reservations_asset on public.reservations (asset_id) where asset_id is not null;

create or replace function public.check_reservation_asset_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.asset_id is not null and not exists (
    select 1 from public.customer_assets
    where id = new.asset_id and organization_id = new.organization_id
  ) then
    raise exception 'ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if new.stage is distinct from old.stage then
    new.stage_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_reservation_asset_tenant on public.reservations;
create trigger trg_check_reservation_asset_tenant
  before update of asset_id, stage on public.reservations
  for each row execute function public.check_reservation_asset_tenant();

create or replace function public.check_reservation_asset_tenant_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.asset_id is not null and not exists (
    select 1 from public.customer_assets
    where id = new.asset_id and organization_id = new.organization_id
  ) then
    raise exception 'ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if new.stage is not null then
    new.stage_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_reservation_asset_tenant_insert on public.reservations;
create trigger trg_check_reservation_asset_tenant_insert
  before insert on public.reservations
  for each row execute function public.check_reservation_asset_tenant_insert();

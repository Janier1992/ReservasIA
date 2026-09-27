-- ============================================================
-- Fase 3: planes/paquetes prepagados y caja.
--
-- Planes (módulo `plans`):
--   package_plans      catálogo del negocio. Tres tipos:
--                      - sessions:   bono de N sesiones ("5 sesiones de fisio")
--                      - membership: ilimitado mientras esté vigente ("lavado ilimitado mensual")
--                      - stamps:     tarjeta de sellos ("el 10º lavado gratis")
--   customer_plans     lo que cada cliente tiene, con su saldo.
--   customer_plan_usages  cada atención que descontó o selló un plan.
--   Al COMPLETAR una reserva, un trigger descuenta automáticamente del plan
--   del cliente que cubra ese servicio (y suma un sello si tiene tarjeta).
--
-- Caja (módulo `cash`):
--   payments           cobros reales (efectivo, Nequi, tarjeta, transferencia),
--                      opcionalmente ligados a una reserva o a la venta de un
--                      plan. Solo se agregan; corregir = borrar (admin) y
--                      volver a registrar.
--
-- Ambos módulos arrancan APAGADOS: soporte los activa por negocio.
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
    'walk_ins', 'reports', 'public_booking', 'assets', 'workflow', 'plans', 'cash'
  ]::text[]);

alter table public.organizations
  alter column disabled_modules set default array['walk_ins', 'reports', 'public_booking', 'plans', 'cash']::text[];

do $$
declare
  k text;
begin
  foreach k in array array['plans', 'cash'] loop
    if not exists (select 1 from public.module_defaults_applied where module_key = k) then
      update public.organizations
        set disabled_modules = array_append(disabled_modules, k)
        where not (k = any (disabled_modules));
      insert into public.module_defaults_applied (module_key) values (k);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Catálogo de planes
-- ------------------------------------------------------------
create table if not exists public.package_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null,
  sessions_total integer,
  validity_days integer,
  price numeric(12, 2),
  currency text not null default 'COP',
  service_ids uuid[] not null default '{}',
  reward_text text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint package_plans_kind_check check (kind in ('sessions', 'membership', 'stamps')),
  constraint package_plans_name_check check (length(trim(name)) between 1 and 80),
  -- Bono y tarjeta necesitan cantidad; la membresía necesita vigencia.
  constraint package_plans_sessions_check check (
    (kind = 'membership' or (sessions_total is not null and sessions_total between 1 and 1000))
  ),
  constraint package_plans_validity_check check (
    (validity_days is null or validity_days between 1 and 3660)
    and (kind <> 'membership' or validity_days is not null)
  ),
  constraint package_plans_price_check check (price is null or price >= 0)
);

create index if not exists idx_package_plans_org on public.package_plans (organization_id);

drop trigger if exists trg_package_plans_updated_at on public.package_plans;
create trigger trg_package_plans_updated_at
  before update on public.package_plans
  for each row execute function system.update_updated_at();

alter table public.package_plans enable row level security;

drop policy if exists "package_plans_select_member" on public.package_plans;
create policy "package_plans_select_member" on public.package_plans for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "package_plans_write_admin" on public.package_plans;
create policy "package_plans_write_admin" on public.package_plans for all to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));
drop policy if exists "package_plans_select_support" on public.package_plans;
create policy "package_plans_select_support" on public.package_plans for select to authenticated
  using (public.is_support_staff());

grant select, insert, update, delete on public.package_plans to authenticated;

-- ------------------------------------------------------------
-- Planes de cada cliente
-- ------------------------------------------------------------
create table if not exists public.customer_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  plan_id uuid references public.package_plans(id) on delete set null,
  -- Copia de lo vendido: si después cambia el catálogo, el plan del cliente no.
  name text not null,
  kind text not null,
  sessions_total integer,
  sessions_used integer not null default 0,
  service_ids uuid[] not null default '{}',
  reward_text text,
  starts_on date not null default current_date,
  expires_on date,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_plans_kind_check check (kind in ('sessions', 'membership', 'stamps')),
  constraint customer_plans_status_check check (status in ('active', 'exhausted', 'reward_ready', 'redeemed', 'expired', 'cancelled')),
  constraint customer_plans_used_check check (sessions_used >= 0 and (sessions_total is null or sessions_used <= sessions_total))
);

create index if not exists idx_customer_plans_customer on public.customer_plans (organization_id, customer_id, status);

drop trigger if exists trg_customer_plans_updated_at on public.customer_plans;
create trigger trg_customer_plans_updated_at
  before update on public.customer_plans
  for each row execute function system.update_updated_at();

create or replace function public.check_customer_plan_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and organization_id = new.organization_id) then
    raise exception 'PLAN_CUSTOMER_MISMATCH' using errcode = 'P0001';
  end if;
  if new.plan_id is not null and not exists (
    select 1 from public.package_plans where id = new.plan_id and organization_id = new.organization_id
  ) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_customer_plan_tenant on public.customer_plans;
create trigger trg_check_customer_plan_tenant
  before insert or update of customer_id, plan_id, organization_id on public.customer_plans
  for each row execute function public.check_customer_plan_tenant();

alter table public.customer_plans enable row level security;

drop policy if exists "customer_plans_select_member" on public.customer_plans;
create policy "customer_plans_select_member" on public.customer_plans for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "customer_plans_insert_member" on public.customer_plans;
create policy "customer_plans_insert_member" on public.customer_plans for insert to authenticated
  with check (public.is_org_member(organization_id));
drop policy if exists "customer_plans_update_member" on public.customer_plans;
create policy "customer_plans_update_member" on public.customer_plans for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists "customer_plans_delete_admin" on public.customer_plans;
create policy "customer_plans_delete_admin" on public.customer_plans for delete to authenticated
  using (public.is_org_admin_or_owner(organization_id));
drop policy if exists "customer_plans_select_support" on public.customer_plans;
create policy "customer_plans_select_support" on public.customer_plans for select to authenticated
  using (public.is_support_staff());

grant select, insert, update, delete on public.customer_plans to authenticated;

-- ------------------------------------------------------------
-- Usos: una fila por (plan del cliente, reserva)
-- ------------------------------------------------------------
create table if not exists public.customer_plan_usages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_plan_id uuid not null references public.customer_plans(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  used_at timestamptz not null default now(),
  constraint customer_plan_usages_unique unique (customer_plan_id, reservation_id)
);

create index if not exists idx_customer_plan_usages_plan on public.customer_plan_usages (customer_plan_id);

alter table public.customer_plan_usages enable row level security;

drop policy if exists "customer_plan_usages_select_member" on public.customer_plan_usages;
create policy "customer_plan_usages_select_member" on public.customer_plan_usages for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "customer_plan_usages_select_support" on public.customer_plan_usages;
create policy "customer_plan_usages_select_support" on public.customer_plan_usages for select to authenticated
  using (public.is_support_staff());

-- Solo lectura para la app: los usos los escribe el trigger de abajo.
grant select on public.customer_plan_usages to authenticated;

-- ------------------------------------------------------------
-- Consumo automático al completar una reserva.
--   1. Si el cliente tiene una membresía vigente que cubre el servicio, se
--      registra el uso y no se descuenta nada más.
--   2. Si no, se descuenta una sesión del bono vigente que cubra el servicio
--      y venza primero; al agotarse queda 'exhausted'.
--   3. Aparte, si tiene tarjeta de sellos activa que cubra el servicio, suma
--      un sello; al completarla queda 'reward_ready' (premio por canjear).
-- Idempotente por la restricción única (plan, reserva): completar dos veces
-- la misma reserva no descuenta dos veces.
-- ------------------------------------------------------------
create or replace function public.apply_customer_plans_on_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_plan public.customer_plans;
  v_today date := (now() at time zone 'utc')::date;
  v_inserted integer;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.customer_id is null then
    return new;
  end if;

  -- Planes vencidos por fecha dejan de contar.
  update public.customer_plans
    set status = 'expired'
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and status = 'active'
      and expires_on is not null
      and expires_on < v_today;

  select * into v_plan
    from public.customer_plans
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and status = 'active'
      and kind = 'membership'
      and (cardinality(service_ids) = 0 or new.service_id = any (service_ids))
    order by expires_on nulls last
    limit 1;

  if not found then
    select * into v_plan
      from public.customer_plans
      where organization_id = new.organization_id
        and customer_id = new.customer_id
        and status = 'active'
        and kind = 'sessions'
        and (cardinality(service_ids) = 0 or new.service_id = any (service_ids))
      order by expires_on nulls last, created_at
      limit 1;
  end if;

  if found then
    insert into public.customer_plan_usages (organization_id, customer_plan_id, reservation_id)
      values (new.organization_id, v_plan.id, new.id)
      on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 and v_plan.kind = 'sessions' then
      update public.customer_plans
        set sessions_used = sessions_used + 1,
            status = case when sessions_used + 1 >= sessions_total then 'exhausted' else status end
        where id = v_plan.id;
    end if;
  end if;

  for v_plan in
    select * from public.customer_plans
      where organization_id = new.organization_id
        and customer_id = new.customer_id
        and status = 'active'
        and kind = 'stamps'
        and (cardinality(service_ids) = 0 or new.service_id = any (service_ids))
  loop
    insert into public.customer_plan_usages (organization_id, customer_plan_id, reservation_id)
      values (new.organization_id, v_plan.id, new.id)
      on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      update public.customer_plans
        set sessions_used = sessions_used + 1,
            status = case when sessions_used + 1 >= sessions_total then 'reward_ready' else status end
        where id = v_plan.id;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_apply_customer_plans_on_completion on public.reservations;
create trigger trg_apply_customer_plans_on_completion
  after update of status on public.reservations
  for each row execute function public.apply_customer_plans_on_completion();

-- ------------------------------------------------------------
-- Caja
-- ------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_plan_id uuid references public.customer_plans(id) on delete set null,
  amount numeric(12, 2) not null,
  currency text not null default 'COP',
  method text not null,
  concept text,
  paid_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint payments_amount_check check (amount > 0),
  constraint payments_method_check check (method in ('cash', 'nequi', 'card', 'transfer', 'other'))
);

create index if not exists idx_payments_org_paid on public.payments (organization_id, paid_at desc);
create index if not exists idx_payments_reservation on public.payments (reservation_id) where reservation_id is not null;

create or replace function public.check_payment_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.reservation_id is not null and not exists (
    select 1 from public.reservations where id = new.reservation_id and organization_id = new.organization_id
  ) then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if new.customer_id is not null and not exists (
    select 1 from public.customers where id = new.customer_id and organization_id = new.organization_id
  ) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if new.customer_plan_id is not null and not exists (
    select 1 from public.customer_plans where id = new.customer_plan_id and organization_id = new.organization_id
  ) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_payment_tenant on public.payments;
create trigger trg_check_payment_tenant
  before insert on public.payments
  for each row execute function public.check_payment_tenant();

alter table public.payments enable row level security;

drop policy if exists "payments_select_member" on public.payments;
create policy "payments_select_member" on public.payments for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "payments_insert_member" on public.payments;
create policy "payments_insert_member" on public.payments for insert to authenticated
  with check (public.is_org_member(organization_id) and recorded_by = (select auth.uid()));
drop policy if exists "payments_delete_admin" on public.payments;
create policy "payments_delete_admin" on public.payments for delete to authenticated
  using (public.is_org_admin_or_owner(organization_id));
drop policy if exists "payments_select_support" on public.payments;
create policy "payments_select_support" on public.payments for select to authenticated
  using (public.is_support_staff());

-- Sin UPDATE: un cobro registrado no se edita (se borra y se vuelve a cargar).
grant select, insert, delete on public.payments to authenticated;

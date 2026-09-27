-- ============================================================
-- Pedidos por QR con aviso de "listo", acciones de la fila y Ventas.
--
-- 1. walk_ins: origen (equipo o QR) y campos del aviso. El cliente que pidió
--    por QR vincula su Telegram/WhatsApp con notify_code (lo hace el server
--    al recibir "/start <código>" o "Pedido <código>"); cuando el equipo marca
--    ready_at, el server le escribe y guarda notified_at (o notify_error).
--    Los campos del aviso los escribe solo el server: el equipo tiene INSERT
--    y UPDATE por columnas.
-- 2. delete_walk_in: borrar un registro (owner/admin). Si la llegada ya había
--    generado su propia reserva activa, se cancela para liberar el recurso.
-- 3. complete_walk_in: "Atendido" en un paso (atender + finalizar).
-- 4. payments: producto vendido y cantidad (Ventas).
-- ============================================================

alter table public.walk_ins
  add column if not exists source text not null default 'staff',
  add column if not exists notify_code text,
  add column if not exists notify_channel text,
  add column if not exists notify_identity text,
  add column if not exists ready_at timestamptz,
  add column if not exists notified_at timestamptz,
  add column if not exists notify_error text;

alter table public.walk_ins drop constraint if exists walk_ins_source_check;
alter table public.walk_ins
  add constraint walk_ins_source_check check (source in ('staff', 'qr'));
alter table public.walk_ins drop constraint if exists walk_ins_notify_channel_check;
alter table public.walk_ins
  add constraint walk_ins_notify_channel_check check (notify_channel is null or notify_channel in ('telegram', 'whatsapp'));
alter table public.walk_ins drop constraint if exists walk_ins_notify_code_check;
alter table public.walk_ins
  add constraint walk_ins_notify_code_check check (notify_code is null or notify_code ~ '^[A-Z0-9]{10}$');

create unique index if not exists uq_walk_ins_notify_code on public.walk_ins (notify_code) where notify_code is not null;
create index if not exists idx_walk_ins_ready_pending on public.walk_ins (ready_at)
  where ready_at is not null and notified_at is null and notify_identity is not null;

revoke insert, update on public.walk_ins from authenticated;
grant insert (id, organization_id, customer_name, customer_phone, service_id, notes, party_size)
  on public.walk_ins to authenticated;
grant update (customer_name, customer_phone, service_id, notes, party_size, status, finished_at, ready_at)
  on public.walk_ins to authenticated;

-- ------------------------------------------------------------
-- delete_walk_in
-- ------------------------------------------------------------
create or replace function public.delete_walk_in(p_walk_in_id uuid)
returns void
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

  if not public.is_org_admin_or_owner(v_walk_in.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Solo la reserva que creó la propia llegada: una reserva hecha por chat o
  -- por la página pública sigue existiendo aunque se borre su llegada.
  if v_walk_in.reservation_id is not null then
    update public.reservations
      set status = 'cancelled'
      where id = v_walk_in.reservation_id
        and source = 'walk_in'
        and status in ('pending', 'confirmed');
  end if;

  delete from public.walk_ins where id = p_walk_in_id;
end;
$$;

revoke all on function public.delete_walk_in(uuid) from public;
grant execute on function public.delete_walk_in(uuid) to authenticated;

-- ------------------------------------------------------------
-- complete_walk_in
-- ------------------------------------------------------------
create or replace function public.complete_walk_in(p_walk_in_id uuid)
returns public.walk_ins
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from public.walk_ins where id = p_walk_in_id;
  if v_status = 'waiting' then
    perform public.serve_walk_in(p_walk_in_id, null);
  end if;
  -- finish_walk_in valida pertenencia y estado (WALK_IN_NOT_FOUND, FORBIDDEN...).
  return public.finish_walk_in(p_walk_in_id);
end;
$$;

revoke all on function public.complete_walk_in(uuid) from public;
grant execute on function public.complete_walk_in(uuid) to authenticated;

-- ------------------------------------------------------------
-- Ventas: producto y cantidad
-- ------------------------------------------------------------
alter table public.payments
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists quantity integer not null default 1;

alter table public.payments drop constraint if exists payments_quantity_check;
alter table public.payments
  add constraint payments_quantity_check check (quantity between 1 and 999);

create index if not exists idx_payments_service on public.payments (service_id) where service_id is not null;

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
  if new.service_id is not null and not exists (
    select 1 from public.services where id = new.service_id and organization_id = new.organization_id
  ) then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

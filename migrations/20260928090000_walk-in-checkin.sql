-- ============================================================
-- Atención en sitio para TODOS los rubros: además de quien llega sin cita,
-- la fila recibe a quien tenía reserva.
--
--   check_in_reservation(reserva)  "Llegó": crea la llegada en walk_ins
--                                  ligada a la reserva existente (sin crear
--                                  otra). Idempotente.
--   serve_walk_in                  si la llegada ya tiene reserva, solo la
--                                  pasa a atención (y puede cambiar el
--                                  recurso); si no, reserva desde ahora como
--                                  antes.
--   finish_walk_in                 sin cambios: completa la reserva.
--
-- También guarda el número de personas de la llegada (restaurantes).
-- ============================================================

alter table public.walk_ins
  add column if not exists party_size integer;

alter table public.walk_ins
  drop constraint if exists walk_ins_party_size_check;
alter table public.walk_ins
  add constraint walk_ins_party_size_check check (party_size is null or party_size between 1 and 200);

-- Una reserva entra a la fila una sola vez.
create unique index if not exists uq_walk_ins_reservation on public.walk_ins (reservation_id) where reservation_id is not null;

-- ------------------------------------------------------------
-- check_in_reservation
-- ------------------------------------------------------------
create or replace function public.check_in_reservation(p_reservation_id uuid)
returns public.walk_ins
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_reservation public.reservations;
  v_walk_in public.walk_ins;
  v_customer public.customers;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.is_org_member(v_reservation.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_walk_in from public.walk_ins where reservation_id = p_reservation_id;
  if found then
    return v_walk_in;
  end if;

  if v_reservation.status not in ('pending', 'confirmed') then
    raise exception 'RESERVATION_NOT_MODIFIABLE' using errcode = 'P0001';
  end if;

  if v_reservation.customer_id is not null then
    select * into v_customer from public.customers where id = v_reservation.customer_id;
  end if;

  -- Quien llegó confirmó su reserva con los hechos.
  if v_reservation.status = 'pending' then
    update public.reservations set status = 'confirmed' where id = p_reservation_id;
  end if;

  insert into public.walk_ins (
    organization_id, customer_id, customer_name, customer_phone, service_id, notes, party_size, reservation_id, status
  ) values (
    v_reservation.organization_id,
    v_reservation.customer_id,
    coalesce(nullif(trim(v_reservation.customer_name), ''), nullif(trim(v_customer.name), ''), 'Cliente'),
    -- Los clientes de Telegram no tienen número real.
    case when v_customer.phone like 'telegram:%' then null else v_customer.phone end,
    v_reservation.service_id,
    v_reservation.special_requests,
    v_reservation.party_size,
    p_reservation_id,
    'waiting'
  )
  returning * into v_walk_in;

  return v_walk_in;
end;
$$;

revoke all on function public.check_in_reservation(uuid) from public;
grant execute on function public.check_in_reservation(uuid) to authenticated;

-- ------------------------------------------------------------
-- serve_walk_in
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

  -- Llegó alguien con reserva: se atiende sobre esa misma reserva.
  if v_walk_in.reservation_id is not null then
    if p_resource_id is not null then
      if not exists (
        select 1 from public.resources where id = p_resource_id and organization_id = v_walk_in.organization_id
      ) then
        raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0001';
      end if;
      begin
        update public.reservations
          set resource_id = p_resource_id
          where id = v_walk_in.reservation_id
            and resource_id is distinct from p_resource_id;
      exception
        when exclusion_violation then
          raise exception 'RESERVATION_NOT_AVAILABLE' using errcode = 'P0001';
      end;
    end if;

    update public.walk_ins
      set status = 'in_service', served_at = now()
      where id = p_walk_in_id
      returning * into v_walk_in;
    return v_walk_in;
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
    v_walk_in.party_size,
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

-- ============================================================
-- Cierra el acceso de visitantes anónimos a funciones pensadas para el
-- compute service.
--
-- Varias funciones security definer dejaban pasar a quien no tenía sesión
-- ("auth.uid() is null") porque así se reconocía al server. Pero un
-- visitante con la clave anon (que va dentro del frontend) tampoco tiene
-- sesión: si la función quedaba ejecutable por PUBLIC —lo normal en
-- Postgres— podía reservar/cancelar/reprogramar en cualquier negocio,
-- buscar clientes ajenos o leer los recordatorios (nombres y teléfonos) de
-- todos los negocios.
--
-- is_backend_caller() distingue al server por el ROL de la petición: la
-- clave admin corre como project_admin; la app y los visitantes, como
-- authenticated o anon. Un usuario logueado sigue pasando por
-- is_org_member() igual que antes; el server sigue funcionando igual.
-- ============================================================

create or replace function public.is_backend_caller()
returns boolean
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  -- El GUC "role" es el rol de la petición (no cambia dentro de una función
  -- security definer); los claims del JWT cubren el caso en que la
  -- plataforma no haga SET ROLE.
  select coalesce(nullif(current_setting('role', true), ''), 'none') not in ('anon', 'authenticated')
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') not in ('anon', 'authenticated')
     and coalesce(current_setting('request.jwt.claim.role', true), '') not in ('anon', 'authenticated');
$$;

grant execute on function public.is_backend_caller() to anon, authenticated;

-- ------------------------------------------------------------
-- book_reservation: misma lógica, solo cambia quién cuenta como server.
-- ------------------------------------------------------------
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
  p_source text default 'whatsapp'
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
begin
  if not public.is_backend_caller() and not public.is_org_member(p_organization_id) then
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
      start_at, end_at, party_size, customer_name, special_requests, source, status
    ) values (
      p_organization_id, p_customer_id, p_service_id, p_resource_id, p_conversation_id,
      p_start_at, p_end_at, p_party_size, p_customer_name, p_special_requests, coalesce(p_source, 'whatsapp'), 'confirmed'
    )
    returning * into v_reservation;
  exception
    when exclusion_violation then
      raise exception 'RESERVATION_NOT_AVAILABLE' using errcode = 'P0001';
  end;

  return v_reservation;
end;
$$;

-- ------------------------------------------------------------
-- cancel_reservation: misma lógica, solo cambia quién cuenta como server.
-- ------------------------------------------------------------
create or replace function public.cancel_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_reservation public.reservations;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.is_backend_caller() and not public.is_org_member(v_reservation.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_reservation.status = 'cancelled' then
    return v_reservation;
  end if;

  update public.reservations
    set status = 'cancelled', updated_at = now()
    where id = p_reservation_id
    returning * into v_reservation;

  return v_reservation;
end;
$$;

-- ------------------------------------------------------------
-- reschedule_reservation: misma lógica, solo cambia quién cuenta como server.
-- ------------------------------------------------------------
create or replace function public.reschedule_reservation(
  p_reservation_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz
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
begin
  if p_new_end_at <= p_new_start_at then
    raise exception 'RESERVATION_INVALID_RANGE' using errcode = 'P0001';
  end if;

  if p_new_start_at < now() then
    raise exception 'RESERVATION_IN_PAST' using errcode = 'P0001';
  end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.is_backend_caller() and not public.is_org_member(v_reservation.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_reservation.status not in ('pending', 'confirmed') then
    raise exception 'RESERVATION_NOT_MODIFIABLE' using errcode = 'P0001';
  end if;

  v_lock_key := hashtextextended(v_reservation.organization_id::text || ':' || date_trunc('day', p_new_start_at)::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if v_reservation.resource_id is null then
    select capacity_total into v_capacity
    from public.business_profiles
    where organization_id = v_reservation.organization_id;

    if v_capacity is not null then
      select coalesce(sum(coalesce(party_size, 1)), 0) into v_used_capacity
      from public.reservations
      where organization_id = v_reservation.organization_id
        and status in ('pending', 'confirmed')
        and resource_id is null
        and id <> v_reservation.id
        and tstzrange(start_at, end_at, '[)') && tstzrange(p_new_start_at, p_new_end_at, '[)');

      if v_used_capacity + coalesce(v_reservation.party_size, 1) > v_capacity then
        raise exception 'RESERVATION_NOT_AVAILABLE' using errcode = 'P0001';
      end if;
    end if;
  end if;

  begin
    update public.reservations
      set start_at = p_new_start_at, end_at = p_new_end_at, updated_at = now()
      where id = p_reservation_id
      returning * into v_reservation;
  exception
    when exclusion_violation then
      raise exception 'RESERVATION_NOT_AVAILABLE' using errcode = 'P0001';
  end;

  return v_reservation;
end;
$$;

-- ------------------------------------------------------------
-- search_customers: misma lógica, solo cambia quién cuenta como server.
-- ------------------------------------------------------------
create or replace function public.search_customers(p_organization_id uuid, p_query text)
returns setof public.customers
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select *
  from public.customers
  where organization_id = p_organization_id
    and (public.is_backend_caller() or public.is_org_member(p_organization_id))
    and (
      p_query is null
      or p_query = ''
      or name ilike '%' || p_query || '%'
      or phone ilike '%' || p_query || '%'
    )
  order by created_at desc;
$$;

-- ------------------------------------------------------------
-- get_due_reservation_reminders: misma lógica, solo cambia quién cuenta como server.
-- ------------------------------------------------------------
create or replace function public.get_due_reservation_reminders()
returns table (
  reservation_id uuid,
  organization_id uuid,
  customer_id uuid,
  customer_phone text,
  customer_name text,
  service_name text,
  start_at timestamptz,
  timezone text,
  business_name text
)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select
    r.id,
    r.organization_id,
    r.customer_id,
    c.phone,
    coalesce(r.customer_name, c.name),
    s.name,
    r.start_at,
    o.timezone,
    bp.name
  from public.reservations r
  join public.organizations o on o.id = r.organization_id
  join public.business_profiles bp on bp.organization_id = r.organization_id
  left join public.customers c on c.id = r.customer_id
  left join public.services s on s.id = r.service_id
  where public.is_backend_caller()
    and r.status = 'confirmed'
    and r.reminder_sent_at is null
    and o.status = 'active'
    and bp.reminder_hours_before > 0
    and c.phone is not null
    and r.start_at > now()
    and r.start_at <= now() + (bp.reminder_hours_before || ' hours')::interval
$$;

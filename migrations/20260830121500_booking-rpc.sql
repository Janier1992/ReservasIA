-- ============================================================
-- RPCs de reservas: book_reservation / cancel_reservation / reschedule_reservation
--
-- Estas funciones son el ÚNICO camino soportado para mutar reservations,
-- tanto desde el agente de IA (compute service, admin key) como desde el
-- dashboard (frontend, insforge.database.rpc). Nunca confían en un
-- organization_id "de autoridad": cuando la llamada viene de un usuario
-- autenticado (auth.uid() no nulo) se revalida membresía; cuando viene con
-- la admin key (auth.uid() nulo) se asume que el llamador ya validó el
-- contexto de tenant.
-- ============================================================

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
  if (select auth.uid()) is not null and not public.is_org_member(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
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

grant execute on function public.book_reservation(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text
) to authenticated;

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

  if (select auth.uid()) is not null and not public.is_org_member(v_reservation.organization_id) then
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

grant execute on function public.cancel_reservation(uuid) to authenticated;

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

  if (select auth.uid()) is not null and not public.is_org_member(v_reservation.organization_id) then
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

grant execute on function public.reschedule_reservation(uuid, timestamptz, timestamptz) to authenticated;

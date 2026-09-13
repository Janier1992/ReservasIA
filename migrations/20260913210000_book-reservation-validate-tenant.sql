-- ============================================================
-- book_reservation() nunca validaba que p_service_id/p_resource_id
-- pertenecieran realmente a p_organization_id: al ser FKs simples hacia
-- services/resources (sin filtro por organización), un service_id o
-- resource_id de OTRA organización pasaba igual porque la fila existe en
-- la tabla, solo que en el tenant equivocado. Se agrega una validación
-- explícita antes del insert.
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

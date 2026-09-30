-- ============================================================
-- Corrige dos problemas introducidos por 20260930091000_recurring-and-packages.sql
-- al reconciliar con el trabajo paralelo que ya estaba en main:
--
-- 1. SEGURIDAD (real, no cosmético, dos capas):
--    a) Esa migración reemplazó book_reservation usando el chequeo viejo
--       `(select auth.uid()) is not null and not is_org_member(...)`, sin
--       darse cuenta de que 20260927230000_close-anon-access-to-backend-rpcs.sql
--       ya lo había reemplazado por `is_backend_caller()` en la misma rama
--       principal. El chequeo viejo deja pasar a cualquier visitante con la
--       clave anon (su auth.uid() también es null) para reservar en
--       CUALQUIER negocio. Se restaura is_backend_caller() acá.
--    b) Para agregar los parámetros nuevos, esa migración hizo
--       DROP FUNCTION + CREATE FUNCTION en vez de un CREATE OR REPLACE con
--       la misma firma — eso resetea el ACL de la función a los privilegios
--       por defecto de Postgres (EXECUTE abierto a PUBLIC, que incluye
--       anon), perdiendo el `revoke`/`grant` explícito original. Se repite
--       acá el mismo patrón usado en el resto de las funciones backend de
--       este proyecto (ver check_in_reservation, complete_walk_in, etc.).
--
-- 2. REDUNDANCIA: el commit "Planes/paquetes y caja por negocio"
--    (20260927090000_plans-and-payments.sql), ya en main antes de esta
--    sesión, implementa el mismo caso de uso de sesiones/paquetes de forma
--    más completa (membresías, sellos, caja, pagos). service_packages y
--    customer_packages (agregadas en 20260930091000) quedan redundantes y
--    se eliminan sin haber tenido datos reales. recurrence_group_id SÍ se
--    conserva: las reservas recurrentes (repetir_semanas) no tienen
--    equivalente en el trabajo de main.
-- ============================================================

drop function if exists public.book_reservation(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, uuid, uuid
);

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
  p_source text default 'whatsapp',
  p_recurrence_group_id uuid default null
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
      start_at, end_at, party_size, customer_name, special_requests, source, status,
      recurrence_group_id
    ) values (
      p_organization_id, p_customer_id, p_service_id, p_resource_id, p_conversation_id,
      p_start_at, p_end_at, p_party_size, p_customer_name, p_special_requests, coalesce(p_source, 'whatsapp'), 'confirmed',
      p_recurrence_group_id
    )
    returning * into v_reservation;
  exception
    when exclusion_violation then
      raise exception 'RESERVATION_NOT_AVAILABLE' using errcode = 'P0001';
  end;

  return v_reservation;
end;
$$;

revoke all on function public.book_reservation(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, uuid
) from public;

grant execute on function public.book_reservation(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, uuid
) to authenticated;

-- ------------------------------------------------------------
-- Limpieza de la feature de paquetes redundante (ver punto 2 arriba). Sin
-- datos reales: se creó y se elimina en la misma sesión.
-- ------------------------------------------------------------
alter table public.reservations drop column if exists customer_package_id;

drop table if exists public.customer_packages cascade;
drop table if exists public.service_packages cascade;

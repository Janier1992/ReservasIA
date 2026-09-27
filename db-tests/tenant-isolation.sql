-- ============================================================
-- Tests de aislamiento multi-tenant y RLS (SQL plano, sin pgTAP).
--
-- IMPORTANTE: este script asume una sesión psql única y persistente
-- (para que `SET LOCAL ROLE` / `SET LOCAL request.jwt.claim.sub` se
-- mantengan dentro de la misma transacción). Ejecutarlo así:
--
--   psql "<connection-string-de-tu-proyecto-InsForge>" -f db-tests/tenant-isolation.sql
--
-- Corre en CI (scripts/test-db.sh) contra un Postgres vacío con el stub de
-- InsForge. Antes de eso no se había podido ejecutar (sin
-- proyecto InsForge vinculado ni acceso a Docker/Postgres local). Revisar
-- el resultado la primera vez que se corra contra un proyecto real.
--
-- No se usa pgTAP (no confirmado que esté instalado en InsForge); en su
-- lugar cada aserción es un bloque DO que aborta con RAISE EXCEPTION si
-- la condición no se cumple, y todo corre dentro de una única transacción
-- que se revierte al final (ROLLBACK) para no dejar datos de prueba.
-- ============================================================
begin;

-- ------------------------------------------------------------
-- Fixtures: dos organizaciones ("A" y "B") con un owner cada una, un staff
-- en A, un recurso y una reserva en la organización A.
--
-- NOTA: se asume que ya existen 3 usuarios reales registrados en
-- auth.users con estos IDs (crealos primero con el flujo normal de
-- signUp de la app y reemplazá los UUID de abajo). No se fabrican filas
-- de auth.users acá porque su esquema exacto no está verificado contra
-- un proyecto InsForge real en este entorno.
-- ------------------------------------------------------------
\set owner_a '''00000000-0000-0000-0000-000000000001'''
\set owner_b '''00000000-0000-0000-0000-000000000002'''
\set staff_a '''00000000-0000-0000-0000-000000000003'''

set local role postgres;

insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Org A Test', 'org-a-rls-test', 'restaurant', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Org B Test', 'org-b-rls-test', 'barbershop', 'America/Bogota');

insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', :owner_a, 'owner'),
  ('22222222-bbbb-0000-0000-000000000002', :owner_b, 'owner'),
  ('11111111-aaaa-0000-0000-000000000001', :staff_a, 'staff');

insert into public.resources (id, organization_id, name, capacity) values
  ('33333333-cccc-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Mesa 1', 4);

insert into public.reservations (id, organization_id, resource_id, start_at, end_at, status, customer_name)
values (
  '44444444-dddd-0000-0000-000000000001',
  '11111111-aaaa-0000-0000-000000000001',
  '33333333-cccc-0000-0000-000000000001',
  now() + interval '1 day',
  now() + interval '1 day 1 hour',
  'confirmed',
  'Cliente A'
);

-- ------------------------------------------------------------
-- 1. Owner de Org A ve su propia reserva y organización.
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = :owner_a;

do $$
begin
  if (select count(*) from public.reservations where id = '44444444-dddd-0000-0000-000000000001') <> 1 then
    raise exception 'FALLÓ: owner de Org A debería ver su propia reserva';
  end if;
  if (select count(*) from public.organizations where id = '11111111-aaaa-0000-0000-000000000001') <> 1 then
    raise exception 'FALLÓ: owner de Org A debería ver su propia organización';
  end if;
  raise notice 'OK: owner de Org A ve sus propios datos';
end $$;

-- ------------------------------------------------------------
-- 2. Owner de Org B NO puede leer nada de Org A.
-- ------------------------------------------------------------
set local request.jwt.claim.sub = :owner_b;

do $$
begin
  if (select count(*) from public.reservations where organization_id = '11111111-aaaa-0000-0000-000000000001') <> 0 then
    raise exception 'FALLÓ: owner de Org B no debería ver reservas de Org A';
  end if;
  if (select count(*) from public.organizations where id = '11111111-aaaa-0000-0000-000000000001') <> 0 then
    raise exception 'FALLÓ: owner de Org B no debería ver la organización A';
  end if;
  if (select count(*) from public.resources where organization_id = '11111111-aaaa-0000-0000-000000000001') <> 0 then
    raise exception 'FALLÓ: owner de Org B no debería ver recursos de Org A';
  end if;
  raise notice 'OK: cross-tenant SELECT bloqueado para owner de Org B';
end $$;

-- UPDATE/DELETE cross-tenant no lanzan excepción (RLS los reduce a 0 filas),
-- así que se verifican por efecto nulo, no por excepción.
update public.reservations set status = 'cancelled' where id = '44444444-dddd-0000-0000-000000000001';
delete from public.reservations where id = '44444444-dddd-0000-0000-000000000001';

set local role postgres;
do $$
begin
  if (select status::text from public.reservations where id = '44444444-dddd-0000-0000-000000000001') <> 'confirmed' then
    raise exception 'FALLÓ: la reserva de Org A fue modificada por un UPDATE cross-tenant';
  end if;
  if (select count(*) from public.reservations where id = '44444444-dddd-0000-0000-000000000001') <> 1 then
    raise exception 'FALLÓ: la reserva de Org A fue borrada por un DELETE cross-tenant';
  end if;
  raise notice 'OK: UPDATE/DELETE cross-tenant no tuvieron efecto';
end $$;

-- INSERT cross-tenant SÍ debe lanzar excepción (WITH CHECK de la policy).
set local role authenticated;
set local request.jwt.claim.sub = :owner_b;

do $$
begin
  begin
    insert into public.reservations (organization_id, resource_id, start_at, end_at)
    values ('11111111-aaaa-0000-0000-000000000001', '33333333-cccc-0000-0000-000000000001', now() + interval '2 days', now() + interval '2 days 1 hour');
    raise exception 'FALLÓ: el INSERT cross-tenant debería haber sido rechazado por RLS';
  exception
    when insufficient_privilege then
      raise notice 'OK: INSERT cross-tenant bloqueado por RLS';
  end;
end $$;

-- ------------------------------------------------------------
-- 3. Staff de Org A puede gestionar reservas pero no eliminar la
-- organización ni ver integraciones.
-- ------------------------------------------------------------
set local request.jwt.claim.sub = :staff_a;

do $$
begin
  if (select count(*) from public.reservations where id = '44444444-dddd-0000-0000-000000000001') <> 1 then
    raise exception 'FALLÓ: staff de Org A debería ver las reservas de su organización';
  end if;
end $$;

update public.reservations set internal_notes = 'nota de staff' where id = '44444444-dddd-0000-0000-000000000001';
delete from public.organizations where id = '11111111-aaaa-0000-0000-000000000001';

set local role postgres;
do $$
begin
  if (select count(*) from public.organizations where id = '11111111-aaaa-0000-0000-000000000001') <> 1 then
    raise exception 'FALLÓ: staff pudo eliminar la organización (sólo el owner debería poder)';
  end if;
  raise notice 'OK: staff no pudo eliminar la organización';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = :staff_a;
do $$
begin
  if (select count(*) from public.integrations where organization_id = '11111111-aaaa-0000-0000-000000000001') <> 0 then
    raise exception 'FALLÓ: staff no debería poder ver integraciones';
  end if;
  raise notice 'OK: staff no ve integraciones';
end $$;

-- ------------------------------------------------------------
-- 4. Anti doble-reserva: EXCLUDE constraint sobre el mismo recurso.
-- ------------------------------------------------------------
set local role postgres;
do $$
begin
  begin
    insert into public.reservations (organization_id, resource_id, start_at, end_at, status)
    values (
      '11111111-aaaa-0000-0000-000000000001',
      '33333333-cccc-0000-0000-000000000001',
      now() + interval '1 day 10 minutes',
      now() + interval '1 day 40 minutes',
      'confirmed'
    );
    raise exception 'FALLÓ: se permitió una reserva solapada para el mismo recurso';
  exception
    when exclusion_violation then
      raise notice 'OK: EXCLUDE constraint bloqueó la reserva solapada';
  end;
end $$;

rollback;

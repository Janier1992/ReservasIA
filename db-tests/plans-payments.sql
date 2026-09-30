-- ============================================================
-- Tests de planes/paquetes (consumo automático al completar reservas) y
-- caja. Mismo estilo que tenant-isolation.sql: transacción revertida.
-- Usuarios: ...0001 dueño de A, ...0003 staff de A, ...0002 dueño de B.
--
--   psql "<conexión>" -v ON_ERROR_STOP=1 -f db-tests/plans-payments.sql
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Lavadero A', 'lav-a-plans', 'car_wash', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Lavadero B', 'lav-b-plans', 'car_wash', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'staff'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.services (id, organization_id, name, duration_minutes, price) values
  ('88888888-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Lavado general', 60, 35000),
  ('88888888-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Polichado', 120, 90000);
insert into public.customers (id, organization_id, name, phone) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana', '3001'),
  ('55555555-0000-0000-0000-000000000002', '22222222-bbbb-0000-0000-000000000002', 'Beto', '3002');
-- Cuatro reservas confirmadas de Ana: 3 de lavado general y 1 de polichado.
insert into public.reservations (id, organization_id, customer_id, service_id, start_at, end_at, status, source)
select ('66666666-0000-0000-0000-00000000000' || n)::uuid, '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       case when n = 4 then '88888888-0000-0000-0000-000000000002' else '88888888-0000-0000-0000-000000000001' end::uuid,
       now() + (n || ' days')::interval, now() + (n || ' days')::interval + interval '1 hour', 'confirmed', 'dashboard'
  from generate_series(1, 4) as n;

do $$ declare m text[]; begin
  select disabled_modules into m from public.organizations where id = '11111111-aaaa-0000-0000-000000000001';
  if not (m @> array['plans', 'cash']) then raise exception 'FAIL: planes y caja deberían arrancar apagados'; end if;
  raise notice 'OK: planes y caja arrancan apagados';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  begin
    insert into public.package_plans (organization_id, name, kind, sessions_total)
      values ('11111111-aaaa-0000-0000-000000000001', 'Bono staff', 'sessions', 5);
    raise exception 'FAIL: staff creó un plan en el catálogo';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: solo owner/admin arman el catálogo de planes';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare p public.customer_plans; n int; begin
  insert into public.package_plans (id, organization_id, name, kind, sessions_total, price, service_ids) values
    ('99999999-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '2 lavados', 'sessions', 2, 60000, array['88888888-0000-0000-0000-000000000001']::uuid[]),
    ('99999999-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Tarjeta 3 sellos', 'stamps', 3, null, '{}');

  begin
    insert into public.customer_plans (organization_id, customer_id, plan_id, name, kind, sessions_total)
      values ('11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', 'x', 'sessions', 2);
    raise exception 'FAIL: plan para un cliente de otro negocio';
  exception when others then if sqlerrm not like '%PLAN_CUSTOMER_MISMATCH%' then raise; end if; end;
  raise notice 'OK: no se vende un plan a un cliente de otro negocio';

  insert into public.customer_plans (id, organization_id, customer_id, plan_id, name, kind, sessions_total, service_ids) values
    ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
     '99999999-0000-0000-0000-000000000001', '2 lavados', 'sessions', 2, array['88888888-0000-0000-0000-000000000001']::uuid[]),
    ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
     '99999999-0000-0000-0000-000000000002', 'Tarjeta 3 sellos', 'stamps', 3, '{}');

  update public.reservations set status = 'completed' where id = '66666666-0000-0000-0000-000000000001';
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if p.sessions_used <> 1 then raise exception 'FAIL: completar no descontó (usadas=%)', p.sessions_used; end if;
  raise notice 'OK: completar una reserva descuenta una sesión del bono';

  update public.reservations set status = 'confirmed' where id = '66666666-0000-0000-0000-000000000001';
  update public.reservations set status = 'completed' where id = '66666666-0000-0000-0000-000000000001';
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if p.sessions_used <> 1 then raise exception 'FAIL: la misma reserva descontó dos veces'; end if;
  raise notice 'OK: completar dos veces la misma reserva no descuenta dos veces';

  update public.reservations set status = 'completed' where id = '66666666-0000-0000-0000-000000000004';
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if p.sessions_used <> 1 then raise exception 'FAIL: descontó un servicio que el bono no cubre'; end if;
  raise notice 'OK: un servicio que el bono no cubre no lo descuenta';

  update public.reservations set status = 'completed' where id = '66666666-0000-0000-0000-000000000002';
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if p.status <> 'exhausted' or p.sessions_used <> 2 then raise exception 'FAIL: bono no quedó agotado (%/%)', p.sessions_used, p.status; end if;
  raise notice 'OK: al usar la última sesión el bono queda agotado';

  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if p.status <> 'reward_ready' or p.sessions_used <> 3 then raise exception 'FAIL: tarjeta de sellos (%/%)', p.sessions_used, p.status; end if;
  raise notice 'OK: la tarjeta de sellos suma en cada atención y queda con premio listo';

  select count(*) into n from public.customer_plan_usages;
  if n <> 5 then raise exception 'FAIL: se esperaban 5 usos, hay %', n; end if;
  raise notice 'OK: cada uso queda registrado';

  insert into public.payments (organization_id, reservation_id, customer_id, amount, method, concept)
    values ('11111111-aaaa-0000-0000-000000000001', '66666666-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', 90000, 'nequi', 'Polichado');
  raise notice 'OK: el dueño registra un cobro';

  begin
    update public.payments set amount = 1 where organization_id = '11111111-aaaa-0000-0000-000000000001';
    raise exception 'FAIL: se pudo editar un cobro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: un cobro registrado no se puede editar';

  -- Vencimiento con la fecha del negocio: el que vence HOY (Bogotá) sigue
  -- contando a cualquier hora; el que venció ayer queda vencido.
  insert into public.customer_plans (id, organization_id, customer_id, name, kind, sessions_total, service_ids, expires_on) values
    ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
     'Bono hoy', 'sessions', 5, array['88888888-0000-0000-0000-000000000001']::uuid[], (now() at time zone 'America/Bogota')::date),
    ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
     'Bono ayer', 'sessions', 5, array['88888888-0000-0000-0000-000000000001']::uuid[], (now() at time zone 'America/Bogota')::date - 1);
  update public.reservations set status = 'completed' where id = '66666666-0000-0000-0000-000000000003';
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  if p.status <> 'active' or p.sessions_used <> 1 then raise exception 'FAIL: el bono que vence hoy no contó (%/%)', p.sessions_used, p.status; end if;
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000004';
  if p.status <> 'expired' then raise exception 'FAIL: el bono vencido ayer sigue %', p.status; end if;
  raise notice 'OK: el vencimiento usa la fecha del negocio';
end $$;

-- Staff: canjea premios, pero no toca usos, estados ni cancela.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare p public.customer_plans; begin
  begin
    update public.customer_plans set sessions_used = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL: staff devolvió sesiones usadas';
  exception when insufficient_privilege then null; end;
  begin
    update public.customer_plans set status = 'active' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL: staff reactivó un bono agotado';
  exception when insufficient_privilege then null; end;
  begin
    update public.customer_plans set status = 'cancelled' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
    raise exception 'FAIL: staff canceló un plan';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.customer_plans (organization_id, customer_id, name, kind, sessions_total, sessions_used)
      values ('11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'Tarjeta casi llena', 'stamps', 5, 4);
    raise exception 'FAIL: staff vendió un plan con usos cargados';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: staff no edita usos, no reactiva, no cancela ni vende planes con usos';

  update public.customer_plans set status = 'redeemed' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if p.status <> 'redeemed' then raise exception 'FAIL: staff no pudo canjear el premio'; end if;
  insert into public.customer_plans (organization_id, customer_id, name, kind, sessions_total)
    values ('11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'Bono staff', 'sessions', 3);
  raise notice 'OK: staff canjea premios y vende planes nuevos';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare p public.customer_plans; begin
  update public.customer_plans set status = 'cancelled' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  select * into p from public.customer_plans where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  if p.status <> 'cancelled' then raise exception 'FAIL: el dueño no pudo cancelar'; end if;
  raise notice 'OK: el dueño cancela planes activos';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  select count(*) into n from public.payments;
  if n <> 0 then raise exception 'FAIL: B ve cobros de A'; end if;
  select count(*) into n from public.customer_plans;
  if n <> 0 then raise exception 'FAIL: B ve planes de A'; end if;
  raise notice 'OK: el dueño de B no ve cobros ni planes de A';
  begin
    insert into public.payments (organization_id, reservation_id, amount, method)
      values ('22222222-bbbb-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', 1000, 'cash');
    raise exception 'FAIL: cobro ligado a una reserva de otro negocio';
  exception when others then if sqlerrm not like '%RESERVATION_NOT_FOUND%' then raise; end if; end;
  raise notice 'OK: no se liga un cobro a una reserva de otro negocio';
end $$;
rollback;

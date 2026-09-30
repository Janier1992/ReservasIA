-- ============================================================
-- Llegada de clientes con reserva a la fila de atención en sitio.
-- Usuarios: ...0001 (dueño de A), ...0002 (dueño de B). Todo se revierte.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Restaurante A', 'restaurante-a', 'restaurant', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Negocio B', 'negocio-b', 'barbershop', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.resources (id, organization_id, name) values
  ('88888888-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Mesa 1'),
  ('88888888-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Mesa 2');
insert into public.customers (id, organization_id, name, phone) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana Gómez', 'telegram:123');
insert into public.reservations (id, organization_id, customer_id, resource_id, start_at, end_at, party_size, source, status, special_requests) values
  ('66666666-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
   '88888888-0000-0000-0000-000000000001', now() + interval '30 minutes', now() + interval '2 hours', 4, 'telegram', 'pending', 'Cumpleaños'),
  ('66666666-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', null,
   '88888888-0000-0000-0000-000000000002', now() + interval '1 hour', now() + interval '2 hours', 2, 'dashboard', 'confirmed', null);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare w public.walk_ins; w2 public.walk_ins; n int; r public.reservations; begin
  w := public.check_in_reservation('66666666-0000-0000-0000-000000000001');
  if w.status <> 'waiting' or w.customer_name <> 'Ana Gómez' or w.customer_phone is not null or w.party_size <> 4 or w.notes <> 'Cumpleaños' then
    raise exception 'FAIL: llegada con reserva mal armada: %', w;
  end if;
  select * into r from public.reservations where id = '66666666-0000-0000-0000-000000000001';
  if r.status <> 'confirmed' then raise exception 'FAIL: la reserva pendiente no quedó confirmada'; end if;
  raise notice 'OK: "Llegó" pone a la persona en la fila con los datos de su reserva';

  w2 := public.check_in_reservation('66666666-0000-0000-0000-000000000001');
  select count(*) into n from public.walk_ins where reservation_id = '66666666-0000-0000-0000-000000000001';
  if w2.id <> w.id or n <> 1 then raise exception 'FAIL: marcar "Llegó" dos veces duplicó la llegada'; end if;
  raise notice 'OK: marcar "Llegó" dos veces no duplica';

  -- Pasa a atención sobre la misma reserva (sin crear otra).
  select count(*) into n from public.reservations;
  w := public.serve_walk_in(w.id, null);
  if w.status <> 'in_service' then raise exception 'FAIL: no pasó a atención'; end if;
  if (select count(*) from public.reservations) <> n then raise exception 'FAIL: creó otra reserva'; end if;
  raise notice 'OK: atender a quien tenía reserva no crea otra reserva';

  w := public.finish_walk_in(w.id);
  select * into r from public.reservations where id = '66666666-0000-0000-0000-000000000001';
  if w.status <> 'done' or r.status <> 'completed' then raise exception 'FAIL: finalizar no completó la reserva'; end if;
  raise notice 'OK: finalizar completa la reserva original';

  -- Cambiar a una mesa ocupada al atender falla con mensaje claro.
  w := public.check_in_reservation('66666666-0000-0000-0000-000000000002');
  insert into public.reservations (organization_id, resource_id, start_at, end_at, source, status)
    values ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', now() + interval '50 minutes', now() + interval '3 hours', 'dashboard', 'confirmed');
  begin
    perform public.serve_walk_in(w.id, '88888888-0000-0000-0000-000000000001');
    raise exception 'FAIL: la pasó a una mesa ocupada';
  exception when others then if sqlerrm not like '%RESERVATION_NOT_AVAILABLE%' then raise; end if; end;
  raise notice 'OK: no se puede pasar a una mesa ocupada';

  -- Llegada sin cita con número de personas: la reserva nueva lo guarda.
  insert into public.walk_ins (id, organization_id, customer_name, party_size)
    values ('99999999-0000-0000-0000-000000000009', '11111111-aaaa-0000-0000-000000000001', 'Grupo Pérez', 6);
  w := public.serve_walk_in('99999999-0000-0000-0000-000000000009', '88888888-0000-0000-0000-000000000002');
  if (select party_size from public.reservations where id = w.reservation_id) <> 6 then
    raise exception 'FAIL: la reserva de la llegada sin cita no guardó las personas';
  end if;
  raise notice 'OK: la llegada sin cita guarda el número de personas';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    perform public.check_in_reservation('66666666-0000-0000-0000-000000000002');
    raise exception 'FAIL: B marcó la llegada de una reserva de A';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: otro negocio no puede marcar llegadas ajenas';
end $$;
rollback;

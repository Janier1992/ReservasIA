-- ============================================================
-- Pedidos por QR (campos de aviso), acciones de la fila (borrar, atendido
-- en un paso) y ventas con producto. Transacción revertida.
-- Usuarios: ...0001 dueño de A, ...0003 staff de A, ...0002 dueño de B.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Antojitos A', 'antojitos-a-qr', 'restaurant', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Otro B', 'otro-b-qr', 'restaurant', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'staff'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.services (id, organization_id, name, duration_minutes, price) values
  ('88888888-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Hamburguesa', 15, 18000),
  ('88888888-0000-0000-0000-000000000002', '22222222-bbbb-0000-0000-000000000002', 'Perro', 10, 9000);
insert into public.walk_ins (id, organization_id, customer_name, service_id, source, notify_code) values
  ('44444444-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana', '88888888-0000-0000-0000-000000000001', 'qr', 'ABCDE12345'),
  ('44444444-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Beto', '88888888-0000-0000-0000-000000000001', 'staff', null),
  ('44444444-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', 'Caro', null, 'staff', null);

do $$ begin
  begin
    insert into public.walk_ins (organization_id, customer_name, notify_code)
      values ('11111111-aaaa-0000-0000-000000000001', 'X', 'corto');
    raise exception 'FAIL: código de aviso inválido aceptado';
  exception when check_violation then null; end;
  raise notice 'OK: el código de aviso tiene formato fijo';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare w public.walk_ins; begin
  begin
    update public.walk_ins set notify_identity = 'telegram:999' where id = '44444444-0000-0000-0000-000000000001';
    raise exception 'FAIL: staff escribió el destino del aviso';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.walk_ins (organization_id, customer_name, notify_identity)
      values ('11111111-aaaa-0000-0000-000000000001', 'Spam', 'telegram:999');
    raise exception 'FAIL: staff creó una llegada con destino de aviso';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: los campos del aviso solo los escribe el server';

  update public.walk_ins set customer_name = 'Ana María', notes = 'sin cebolla', ready_at = now()
    where id = '44444444-0000-0000-0000-000000000001';
  select * into w from public.walk_ins where id = '44444444-0000-0000-0000-000000000001';
  if w.customer_name <> 'Ana María' or w.ready_at is null then raise exception 'FAIL: staff no pudo editar ni marcar listo'; end if;
  raise notice 'OK: staff edita datos y marca listo';

  begin
    perform public.delete_walk_in('44444444-0000-0000-0000-000000000002');
    raise exception 'FAIL: staff borró un registro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: solo owner/admin borran registros';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    perform public.delete_walk_in('44444444-0000-0000-0000-000000000002');
    raise exception 'FAIL: el dueño de B borró un registro de A';
  exception when insufficient_privilege then null; end;
  begin
    perform public.complete_walk_in('44444444-0000-0000-0000-000000000003');
    raise exception 'FAIL: el dueño de B atendió una llegada de A';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: otro negocio no borra ni atiende llegadas ajenas';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare w public.walk_ins; r public.reservations; n int; begin
  -- Atendido en un paso desde la espera: crea la reserva y la completa.
  w := public.complete_walk_in('44444444-0000-0000-0000-000000000003');
  select * into r from public.reservations where id = w.reservation_id;
  if w.status <> 'done' or r.status <> 'completed' then raise exception 'FAIL: atendido en un paso (% / %)', w.status, r.status; end if;
  raise notice 'OK: "Atendido" desde la espera atiende y finaliza de una vez';

  -- Borrar una llegada en atención cancela la reserva que ella creó.
  w := public.serve_walk_in('44444444-0000-0000-0000-000000000002', null);
  perform public.delete_walk_in('44444444-0000-0000-0000-000000000002');
  select * into r from public.reservations where id = w.reservation_id;
  select count(*) into n from public.walk_ins where id = '44444444-0000-0000-0000-000000000002';
  if n <> 0 or r.status <> 'cancelled' then raise exception 'FAIL: borrar (quedan %, reserva %)', n, r.status; end if;
  raise notice 'OK: borrar una llegada en atención libera su reserva';

  insert into public.payments (organization_id, service_id, quantity, amount, method, concept)
    values ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 2, 36000, 'cash', 'Hamburguesa');
  raise notice 'OK: se registra una venta con producto y cantidad';

  begin
    insert into public.payments (organization_id, service_id, amount, method)
      values ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000002', 9000, 'cash');
    raise exception 'FAIL: venta con producto de otro negocio';
  exception when others then if sqlerrm not like '%SERVICE_NOT_FOUND%' then raise; end if; end;
  begin
    insert into public.payments (organization_id, service_id, quantity, amount, method)
      values ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 0, 1000, 'cash');
    raise exception 'FAIL: cantidad 0 aceptada';
  exception when check_violation then null; end;
  raise notice 'OK: no se vende un producto ajeno ni cantidad 0';
end $$;
rollback;

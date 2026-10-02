-- ============================================================
-- Pedidos por QR con varios productos: formato de order_items y que el
-- equipo no pueda escribirlo. Transacción revertida.
-- Usuarios: ...0003 staff de A.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Antojitos A', 'antojitos-a-items', 'restaurant', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'staff');
insert into public.walk_ins (id, organization_id, customer_name, source, notify_code, order_items) values
  ('44444444-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana', 'qr', 'ABCDE12345',
   '[{"service_id": "88888888-0000-0000-0000-000000000001", "name": "Hamburguesa", "quantity": 2, "unit_price": 18000, "currency": "COP"},
     {"service_id": "88888888-0000-0000-0000-000000000002", "name": "Limonada", "quantity": 1, "unit_price": 6000, "currency": "COP"}]');

do $$ begin
  begin
    insert into public.walk_ins (organization_id, customer_name, order_items)
      values ('11111111-aaaa-0000-0000-000000000001', 'X', '{"name": "no es lista"}');
    raise exception 'FAIL: order_items que no es lista aceptado';
  exception when check_violation then null; end;
  begin
    insert into public.walk_ins (organization_id, customer_name, order_items)
      values ('11111111-aaaa-0000-0000-000000000001', 'X', '[]');
    raise exception 'FAIL: pedido vacío aceptado';
  exception when check_violation then null; end;
  raise notice 'OK: order_items es una lista de 1 a 20 productos';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare n int; begin
  select jsonb_array_length(order_items) into n from public.walk_ins where id = '44444444-0000-0000-0000-000000000001';
  if n is distinct from 2 then raise exception 'FAIL: staff no ve los productos del pedido'; end if;
  begin
    update public.walk_ins set order_items = '[{"name": "Gratis", "quantity": 1}]'
      where id = '44444444-0000-0000-0000-000000000001';
    raise exception 'FAIL: staff modificó el pedido del cliente';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.walk_ins (organization_id, customer_name, order_items)
      values ('11111111-aaaa-0000-0000-000000000001', 'Spam', '[{"name": "x", "quantity": 1}]');
    raise exception 'FAIL: staff creó un pedido con productos';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: el equipo ve los productos pero no puede escribirlos';
end $$;

rollback;

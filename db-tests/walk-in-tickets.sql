-- ============================================================
-- Número de ticket de Atención en sitio: consecutivo por negocio y día (en
-- la zona horaria del negocio), no se puede elegir ni cambiar. Revertido.
-- Usuarios: ...0003 staff de A.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Antojitos A', 'antojitos-a-tickets', 'restaurant', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Otro B', 'otro-b-tickets', 'restaurant', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'staff');

do $$ declare a int; b int; c int; other int; yesterday int; forced int; begin
  -- 23:30 del día anterior en Bogotá (04:30 UTC): cuenta para ayer, no para hoy.
  insert into public.walk_ins (organization_id, customer_name, arrived_at)
    values ('11111111-aaaa-0000-0000-000000000001', 'Noche', '2026-10-03T04:30:00Z') returning ticket_number into yesterday;
  insert into public.walk_ins (organization_id, customer_name, arrived_at)
    values ('11111111-aaaa-0000-0000-000000000001', 'Ana', '2026-10-03T15:00:00Z') returning ticket_number into a;
  insert into public.walk_ins (organization_id, customer_name, arrived_at)
    values ('11111111-aaaa-0000-0000-000000000001', 'Beto', '2026-10-03T15:05:00Z') returning ticket_number into b;
  insert into public.walk_ins (organization_id, customer_name, arrived_at, ticket_number)
    values ('11111111-aaaa-0000-0000-000000000001', 'Caro', '2026-10-03T15:10:00Z', 99) returning ticket_number into forced;
  insert into public.walk_ins (organization_id, customer_name, arrived_at)
    values ('22222222-bbbb-0000-0000-000000000002', 'Otro', '2026-10-03T15:00:00Z') returning ticket_number into other;
  insert into public.walk_ins (organization_id, customer_name, arrived_at)
    values ('11111111-aaaa-0000-0000-000000000001', 'Día siguiente', '2026-10-04T15:00:00Z') returning ticket_number into c;
  if yesterday <> 1 or a <> 1 or b <> 2 then raise exception 'FAIL: consecutivo por día (% % %)', yesterday, a, b; end if;
  if forced <> 3 then raise exception 'FAIL: se pudo elegir el número de ticket (%)', forced; end if;
  if other <> 1 then raise exception 'FAIL: otro negocio no arranca en 1 (%)', other; end if;
  if c <> 1 then raise exception 'FAIL: el día siguiente no reinicia (%)', c; end if;
  raise notice 'OK: ticket consecutivo por negocio y día, en la hora local del negocio';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare n int; begin
  insert into public.walk_ins (organization_id, customer_name)
    values ('11111111-aaaa-0000-0000-000000000001', 'Desde el panel') returning ticket_number into n;
  if n is null then raise exception 'FAIL: la llegada del panel no recibió ticket'; end if;
  begin
    update public.walk_ins set ticket_number = 1 where customer_name = 'Desde el panel';
    raise exception 'FAIL: staff cambió el número de ticket';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: el panel recibe ticket y no lo puede cambiar';
end $$;

rollback;

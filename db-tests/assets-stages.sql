-- ============================================================
-- Tests de fichas (customer_assets), etapas de reserva y módulos nuevos
-- (mismo estilo que tenant-isolation.sql). Todo en una transacción que se
-- revierte. Usa los usuarios ...0001 (dueño de A) y ...0002 (dueño de B).
--
--   psql "<conexión>" -v ON_ERROR_STOP=1 -f db-tests/assets-stages.sql
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Taller A', 'taller-a', 'auto_repair', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Lavadero B', 'lavadero-b', 'car_wash', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.customers (id, organization_id, name, phone) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana', '3001'),
  ('55555555-0000-0000-0000-000000000002', '22222222-bbbb-0000-0000-000000000002', 'Beto', '3002');
insert into public.reservations (id, organization_id, customer_id, start_at, end_at, source) values
  ('66666666-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
   now() + interval '1 day', now() + interval '1 day 1 hour', 'dashboard');
insert into public.customer_assets (id, organization_id, customer_id, asset_type, label) values
  ('77777777-0000-0000-0000-000000000002', '22222222-bbbb-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', 'vehicle', 'XYZ999');

do $$ declare m text[]; begin
  select disabled_modules into m from public.organizations where id = '11111111-aaaa-0000-0000-000000000001';
  if not ('public_booking' = any (m)) then raise exception 'FAIL: reservas públicas no arranca apagado'; end if;
  if 'assets' = any (m) or 'workflow' = any (m) then raise exception 'FAIL: fichas/etapas deberían arrancar encendidos'; end if;
  raise notice 'OK: reservas públicas arranca apagado; fichas y etapas encendidos';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare n int; r public.reservations; begin
  insert into public.customer_assets (id, organization_id, customer_id, asset_type, label, attributes)
    values ('77777777-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001',
            '55555555-0000-0000-0000-000000000001', 'vehicle', 'ABC 123', '{"brand": "Mazda", "mileage": 45000}');
  raise notice 'OK: el dueño crea la ficha de un vehículo de su cliente';

  begin
    insert into public.customer_assets (organization_id, customer_id, asset_type, label)
      values ('11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'vehicle', 'abc123');
    raise exception 'FAIL: aceptó la misma placa dos veces';
  exception when unique_violation then null; end;
  raise notice 'OK: la misma placa (sin importar mayúsculas/espacios) no se duplica';

  begin
    insert into public.customer_assets (organization_id, customer_id, asset_type, label)
      values ('11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 'vehicle', 'OTRA1');
    raise exception 'FAIL: ficha con cliente de otro negocio';
  exception when others then if sqlerrm not like '%ASSET_CUSTOMER_MISMATCH%' then raise; end if; end;
  raise notice 'OK: no se puede crear una ficha con un cliente de otro negocio';

  select count(*) into n from public.customer_assets;
  if n <> 1 then raise exception 'FAIL: el dueño de A ve % fichas', n; end if;
  raise notice 'OK: el dueño de A solo ve sus fichas';

  begin
    update public.reservations set asset_id = '77777777-0000-0000-0000-000000000002'
      where id = '66666666-0000-0000-0000-000000000001';
    raise exception 'FAIL: vinculó una ficha de otro negocio';
  exception when others then if sqlerrm not like '%ASSET_NOT_FOUND%' then raise; end if; end;
  raise notice 'OK: no se puede vincular una ficha de otro negocio a una reserva';

  update public.reservations set asset_id = '77777777-0000-0000-0000-000000000001', stage = 'diagnosis'
    where id = '66666666-0000-0000-0000-000000000001' returning * into r;
  if r.stage_updated_at is null then raise exception 'FAIL: no registró la hora del cambio de etapa'; end if;
  raise notice 'OK: vincular ficha y cambiar de etapa registra la hora del cambio';

  begin
    update public.reservations set stage = 'Listo; drop table' where id = '66666666-0000-0000-0000-000000000001';
    raise exception 'FAIL: aceptó una etapa con formato inválido';
  exception when check_violation then null; end;
  raise notice 'OK: etapa con formato inválido rechazada';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  select count(*) into n from public.customer_assets where organization_id = '11111111-aaaa-0000-0000-000000000001';
  if n <> 0 then raise exception 'FAIL: el dueño de B ve fichas de A'; end if;
  update public.customer_assets set label = 'HACK' where id = '77777777-0000-0000-0000-000000000001';
  raise notice 'OK: el dueño de B no ve ni modifica fichas de A';
end $$;

set local role postgres;
do $$ begin
  if (select label from public.customer_assets where id = '77777777-0000-0000-0000-000000000001') <> 'ABC 123' then
    raise exception 'FAIL: B modificó la ficha de A';
  end if;
  raise notice 'OK: la ficha de A quedó intacta';
end $$;
rollback;

-- ============================================================
-- Tests de módulos por negocio, suscripción y atención en sitio (SQL plano,
-- mismo estilo que tenant-isolation.sql). Todo corre en una transacción que
-- se revierte al final. Usa los usuarios ...0001 (dueño de A) y ...0002
-- (dueño de B) de tenant-isolation.sql, y ...000a como soporte.
--
--   psql "<conexión>" -v ON_ERROR_STOP=1 -f db-tests/modules-billing-walkins.sql
-- ============================================================
begin;
set local role postgres;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','sup@x.co') on conflict do nothing;
insert into public.support_staff(user_id, role) values ('00000000-0000-0000-0000-00000000000a','admin');
insert into public.organizations (id, name, slug, business_type, timezone, status) values
  ('11111111-aaaa-0000-0000-000000000001', 'Lavadero A', 'lav-a', 'car_wash', 'America/Bogota', 'suspended'),
  ('22222222-bbbb-0000-0000-000000000002', 'Taller B', 'tal-b', 'auto_repair', 'America/Bogota', 'active');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.resources(id, organization_id, name) values ('33333333-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000001','Bahía 1');
insert into public.walk_ins(id, organization_id, customer_name) values ('44444444-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000001','Ana');
insert into public.walk_ins(id, organization_id, customer_name) values ('44444444-0000-0000-0000-000000000002','11111111-aaaa-0000-0000-000000000001','Beto');

do $$ begin
  if (select disabled_modules from public.organizations where id='11111111-aaaa-0000-0000-000000000001') <> array['walk_ins','reports'] then
    raise exception 'FAIL: negocio nuevo no arranca con walk_ins y reports apagados';
  end if;
  raise notice 'OK: negocio nuevo arranca con walk_ins y reports apagados';
end $$;

-- Dueño de A (suspendido)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  begin update public.organizations set status='active' where id='11111111-aaaa-0000-0000-000000000001';
    raise exception 'FAIL: dueño reactivó su cuenta';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'OK: dueño no puede reactivar su cuenta suspendida';
  begin update public.organizations set subscription_expires_at = now() + interval '1 year' where id='11111111-aaaa-0000-0000-000000000001';
    raise exception 'FAIL: dueño extendió su vencimiento';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'OK: dueño no puede extender su vencimiento';
  begin update public.organizations set disabled_modules='{}' where id='11111111-aaaa-0000-0000-000000000001';
    raise exception 'FAIL: dueño activó módulos';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'OK: dueño no puede activarse módulos';
  update public.organizations set name='Lavadero A renombrado' where id='11111111-aaaa-0000-0000-000000000001';
  if (select name from public.organizations where id='11111111-aaaa-0000-0000-000000000001') <> 'Lavadero A renombrado' then raise exception 'FAIL: dueño no pudo renombrar'; end if;
  raise notice 'OK: dueño sí puede editar el nombre';
end $$;

-- Dueño de B intenta tocar la fila de A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  select count(*) into n from public.walk_ins;
  if n <> 0 then raise exception 'FAIL: dueño de B ve % llegadas de A', n; end if;
  raise notice 'OK: dueño de B no ve la fila de A';
  begin perform public.serve_walk_in('44444444-0000-0000-0000-000000000001', null);
    raise exception 'FAIL: dueño de B atendió una llegada de A';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'OK: dueño de B no puede atender llegadas de A';
  update public.walk_ins set status='left' where id='44444444-0000-0000-0000-000000000002';
end $$;

-- Soporte
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  update public.organizations set status='active', disabled_modules='{reports}' where id='11111111-aaaa-0000-0000-000000000001';
  if (select status from public.organizations where id='11111111-aaaa-0000-0000-000000000001') <> 'active' then raise exception 'FAIL: soporte no pudo reactivar'; end if;
  raise notice 'OK: soporte reactiva y enciende Atención en sitio';
  if (select count(*) from public.walk_ins) <> 2 then raise exception 'FAIL: soporte no ve walk_ins'; end if;
  raise notice 'OK: soporte ve la fila (lectura)';
  begin update public.organizations set disabled_modules='{bogus}' where id='11111111-aaaa-0000-0000-000000000001';
    raise exception 'FAIL: aceptó módulo desconocido';
  exception when check_violation then null; end;
  raise notice 'OK: módulo desconocido rechazado';
end $$;

-- Dueño de A atiende y finaliza; B no pudo marcar "se fue"
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare w public.walk_ins; r public.reservations; begin
  if (select status from public.walk_ins where id='44444444-0000-0000-0000-000000000002') <> 'waiting' then raise exception 'FAIL: B modificó una llegada de A'; end if;
  raise notice 'OK: el update de B sobre la fila de A no tuvo efecto';
  w := public.serve_walk_in('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001');
  select * into r from public.reservations where id = w.reservation_id;
  if r.source <> 'walk_in' or r.status <> 'confirmed' then raise exception 'FAIL: reserva de walk-in incorrecta'; end if;
  raise notice 'OK: atender crea una reserva real (walk_in, confirmada)';
  begin perform public.serve_walk_in('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001');
    raise exception 'FAIL: dos clientes en la misma bahía';
  exception when others then if sqlerrm not like '%RESERVATION_NOT_AVAILABLE%' then raise; end if; end;
  raise notice 'OK: bahía ocupada rechazada';
  w := public.finish_walk_in('44444444-0000-0000-0000-000000000001');
  if (select status from public.reservations where id = w.reservation_id) <> 'completed' then raise exception 'FAIL: no se completó'; end if;
  raise notice 'OK: finalizar completa la reserva';
end $$;
rollback;

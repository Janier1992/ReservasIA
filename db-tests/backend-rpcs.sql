-- ============================================================
-- Funciones del server: un visitante anónimo (clave anon) ni un usuario de
-- otro negocio pueden usarlas; el server (rol distinto de anon/authenticated)
-- y los miembros del negocio sí. Todo se revierte.
-- ============================================================
\set QUIET on
begin;
set local role postgres;

-- ------------------------------------------------------------
-- Chequeo de ACL a nivel de Postgres (no solo de comportamiento): más abajo
-- se prueba que anon NO PUEDE ejecutar estas funciones invocándolas de
-- verdad, pero esa prueba por sí sola no distingue "Postgres le niega el
-- permiso" de "Postgres se lo permite y la lógica interna lo rechaza
-- después" — ambos casos terminan lanzando el mismo SQLSTATE 42501
-- (insufficient_privilege), que es justo el código que usa la propia
-- excepción 'FORBIDDEN' del cuerpo de estas funciones. Un `DROP FUNCTION` +
-- `CREATE FUNCTION` para cambiar la firma (necesario para agregar un
-- parámetro nuevo) resetea el ACL a los valores por defecto de Postgres
-- (EXECUTE abierto a PUBLIC/anon) sin que ningún test de comportamiento lo
-- note, si la lógica interna sigue rechazando igual al visitante anónimo
-- por otro motivo (esto pasó de verdad: ver 20260930092000 y 20260930093000).
-- Este bloque verifica el permiso real, no el resultado.
do $$ declare
  fn text;
  funcs text[] := array[
    'public.book_reservation(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, uuid)',
    'public.cancel_reservation(uuid)',
    'public.reschedule_reservation(uuid, timestamptz, timestamptz)',
    'public.search_customers(uuid, text)',
    'public.accept_organization_invite(uuid)',
    'public.claim_demo_organization(uuid)',
    'public.create_organization_with_owner(text, text, text, text)',
    'public.current_user_email()',
    'public.finish_walk_in(uuid)',
    'public.serve_walk_in(uuid, uuid)',
    'public.get_due_reservation_reminders()'
  ];
begin
  foreach fn in array funcs loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'FAIL: anon tiene EXECUTE real sobre % (falta revoke from public)', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'FAIL: authenticated NO tiene EXECUTE sobre % (se rompió el grant)', fn;
    end if;
  end loop;
  raise notice 'OK: anon no tiene EXECUTE real (a nivel de permiso, no solo de lógica) sobre ninguna RPC de backend, y authenticated sí';
end $$;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Negocio A', 'negocio-a', 'barbershop', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');
insert into public.business_profiles (organization_id, name, timezone, reminder_hours_before) values
  ('11111111-aaaa-0000-0000-000000000001', 'Negocio A', 'America/Bogota', 24);
insert into public.customers (id, organization_id, name, phone) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana', '3001');
insert into public.reservations (id, organization_id, customer_id, start_at, end_at, source, status) values
  ('66666666-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
   now() + interval '2 hours', now() + interval '3 hours', 'dashboard', 'confirmed');

do $$ declare n int; begin
  if not public.is_backend_caller() then raise exception 'FAIL: el server no se reconoce como server'; end if;
  select count(*) into n from public.get_due_reservation_reminders();
  if n <> 1 then raise exception 'FAIL: el server ve % recordatorios', n; end if;
  raise notice 'OK: el server sigue viendo los recordatorios';
end $$;

-- El server de verdad NO es superusuario: corre como project_admin. Si
-- pierde EXECUTE sobre estas funciones, el agente deja de reservar y los
-- recordatorios dejan de salir, sin que ninguna otra prueba lo note.
set local role project_admin;
do $$ declare n int; r public.reservations; begin
  if not public.is_backend_caller() then raise exception 'FAIL: project_admin no se reconoce como server'; end if;
  select count(*) into n from public.get_due_reservation_reminders();
  if n <> 1 then raise exception 'FAIL: project_admin ve % recordatorios', n; end if;
  r := public.book_reservation('11111111-aaaa-0000-0000-000000000001', null, null, null, null,
    now() + interval '3 days', now() + interval '3 days 1 hour', null, 'Desde el agente', null, 'telegram');
  r := public.reschedule_reservation(r.id, now() + interval '4 days', now() + interval '4 days 1 hour');
  r := public.cancel_reservation(r.id);
  if r.status <> 'cancelled' then raise exception 'FAIL: project_admin no pudo cancelar'; end if;
  raise notice 'OK: el server (project_admin) reserva, reprograma, cancela y ve recordatorios';
end $$;
reset role;
set local role postgres;

set local role anon;
do $$ begin
  if public.is_backend_caller() then raise exception 'FAIL: anon pasa por server'; end if;

  -- Ahora anon no tiene ni siquiera EXECUTE sobre estas dos (ver
  -- 20260930093000/20260930094000): la excepción llega antes de que corra
  -- el cuerpo de la función, así que se captura igual que las de reservas
  -- de más abajo, no con un select suelto.
  begin
    perform public.get_due_reservation_reminders();
    raise exception 'FAIL: anon ve recordatorios';
  exception when insufficient_privilege then null; end;
  begin
    perform public.search_customers('11111111-aaaa-0000-0000-000000000001', '');
    raise exception 'FAIL: anon busca clientes';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: un visitante anónimo no ve recordatorios ni clientes';

  begin
    perform public.book_reservation('11111111-aaaa-0000-0000-000000000001', null, null, null, null,
      now() + interval '1 day', now() + interval '1 day 1 hour', null, 'Spam', null, 'web');
    raise exception 'FAIL: anon reservó';
  exception when insufficient_privilege then null; end;
  begin
    perform public.cancel_reservation('66666666-0000-0000-0000-000000000001');
    raise exception 'FAIL: anon canceló';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reschedule_reservation('66666666-0000-0000-0000-000000000001', now() + interval '5 days', now() + interval '5 days 1 hour');
    raise exception 'FAIL: anon reprogramó';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: un visitante anónimo no reserva, cancela ni reprograma';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  select count(*) into n from public.get_due_reservation_reminders();
  if n <> 0 then raise exception 'FAIL: un usuario ve recordatorios de todos'; end if;
  select count(*) into n from public.search_customers('11111111-aaaa-0000-0000-000000000001', '');
  if n <> 0 then raise exception 'FAIL: B busca clientes de A'; end if;
  begin
    perform public.cancel_reservation('66666666-0000-0000-0000-000000000001');
    raise exception 'FAIL: B canceló una reserva de A';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: un usuario de otro negocio tampoco';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare n int; r public.reservations; begin
  select count(*) into n from public.search_customers('11111111-aaaa-0000-0000-000000000001', 'An');
  if n <> 1 then raise exception 'FAIL: el dueño no encuentra a su cliente'; end if;
  r := public.reschedule_reservation('66666666-0000-0000-0000-000000000001', now() + interval '5 days', now() + interval '5 days 1 hour');
  r := public.cancel_reservation('66666666-0000-0000-0000-000000000001');
  if r.status <> 'cancelled' then raise exception 'FAIL: el dueño no pudo cancelar'; end if;
  raise notice 'OK: el dueño sigue buscando, reprogramando y cancelando lo suyo';
end $$;
rollback;

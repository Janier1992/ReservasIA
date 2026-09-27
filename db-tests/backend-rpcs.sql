-- ============================================================
-- Funciones del server: un visitante anónimo (clave anon) ni un usuario de
-- otro negocio pueden usarlas; el server (rol distinto de anon/authenticated)
-- y los miembros del negocio sí. Todo se revierte.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
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

set local role anon;
do $$ declare n int; begin
  if public.is_backend_caller() then raise exception 'FAIL: anon pasa por server'; end if;
  select count(*) into n from public.get_due_reservation_reminders();
  if n <> 0 then raise exception 'FAIL: anon ve % recordatorios', n; end if;
  select count(*) into n from public.search_customers('11111111-aaaa-0000-0000-000000000001', '');
  if n <> 0 then raise exception 'FAIL: anon busca clientes'; end if;
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

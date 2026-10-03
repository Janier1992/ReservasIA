-- ============================================================
-- Vínculo de chat de reservas de la página pública: formato del código,
-- canal válido y código único. Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Barbería A', 'barberia-a-link', 'barbershop', 'America/Bogota');
insert into public.services (id, organization_id, name, duration_minutes, price) values
  ('88888888-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Corte', 30, 25000);
insert into public.reservations (id, organization_id, service_id, start_at, end_at, status, source, notify_code) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001',
   '2030-01-10T15:00:00Z', '2030-01-10T15:30:00Z', 'confirmed', 'web', 'ABCDE23456');

do $$ begin
  begin
    update public.reservations set notify_code = 'corto' where id = '55555555-0000-0000-0000-000000000001';
    raise exception 'FAIL: código con formato inválido aceptado';
  exception when check_violation then null; end;
  begin
    update public.reservations set notify_channel = 'sms' where id = '55555555-0000-0000-0000-000000000001';
    raise exception 'FAIL: canal inválido aceptado';
  exception when check_violation then null; end;
  begin
    insert into public.reservations (organization_id, service_id, start_at, end_at, status, source, notify_code) values
      ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001',
       '2030-01-11T15:00:00Z', '2030-01-11T15:30:00Z', 'confirmed', 'web', 'ABCDE23456');
    raise exception 'FAIL: código repetido aceptado';
  exception when unique_violation then null; end;
  update public.reservations set notify_channel = 'telegram', notify_identity = 'telegram:77'
    where id = '55555555-0000-0000-0000-000000000001';
  raise notice 'OK: el código de aviso de la reserva es único y con formato fijo';
end $$;

rollback;

-- ============================================================
-- Menú del día: available_days solo acepta días de 0 a 6 y al menos uno.
-- Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Antojitos A', 'antojitos-a-menu', 'restaurant', 'America/Bogota');
insert into public.services (id, organization_id, name, duration_minutes, price, available_days) values
  ('88888888-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Sopa de mondongo', 15, 18000, '{1,4}'),
  ('88888888-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Limonada', 5, 6000, null);

do $$ begin
  begin
    update public.services set available_days = '{7}' where id = '88888888-0000-0000-0000-000000000001';
    raise exception 'FAIL: día 7 aceptado';
  exception when check_violation then null; end;
  begin
    update public.services set available_days = '{}' where id = '88888888-0000-0000-0000-000000000001';
    raise exception 'FAIL: lista vacía aceptada (debe ser null = todos los días)';
  exception when check_violation then null; end;
  update public.services set available_days = '{0,6}' where id = '88888888-0000-0000-0000-000000000001';
  raise notice 'OK: los días del menú van de domingo (0) a sábado (6)';
end $$;

rollback;

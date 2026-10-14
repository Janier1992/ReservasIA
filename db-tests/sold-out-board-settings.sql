-- ============================================================
-- Agotado del día y ajustes del tablero: columnas, valores por defecto y
-- límites de la alerta de demora. Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-bbbb-0000-0000-000000000001', 'Antojitos B', 'antojitos-b-agotado', 'restaurant', 'America/Bogota');
insert into public.business_profiles (organization_id, name, timezone) values
  ('11111111-bbbb-0000-0000-000000000001', 'Antojitos B', 'America/Bogota');
insert into public.services (id, organization_id, name, duration_minutes, price) values
  ('88888888-1111-0000-0000-000000000001', '11111111-bbbb-0000-0000-000000000001', 'Bandeja paisa', 20, 34000);

do $$
declare
  p record;
begin
  update public.services set sold_out_on = date '2026-10-14' where id = '88888888-1111-0000-0000-000000000001';

  select wait_alert_minutes, display_hide_prices, display_hide_names into p
    from public.business_profiles where organization_id = '11111111-bbbb-0000-0000-000000000001';
  if p.wait_alert_minutes is distinct from 15 or p.display_hide_prices or p.display_hide_names then
    raise exception 'FAIL: valores por defecto del tablero inesperados';
  end if;

  begin
    update public.business_profiles set wait_alert_minutes = 0 where organization_id = '11111111-bbbb-0000-0000-000000000001';
    raise exception 'FAIL: alerta de 0 minutos aceptada';
  exception when check_violation then null; end;
  begin
    update public.business_profiles set wait_alert_minutes = 241 where organization_id = '11111111-bbbb-0000-0000-000000000001';
    raise exception 'FAIL: alerta de 241 minutos aceptada';
  exception when check_violation then null; end;
  update public.business_profiles set wait_alert_minutes = null where organization_id = '11111111-bbbb-0000-0000-000000000001';
  raise notice 'OK: agotado del día y alerta de demora (1 a 240 min o apagada)';
end $$;

rollback;

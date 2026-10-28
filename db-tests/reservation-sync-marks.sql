-- ============================================================
-- Marcas de aviso al cliente (correo + Google Calendar): toda reserva
-- nueva, venga de donde venga, queda pendiente hasta que el server la
-- avisa; y la marca solo se pone una vez. Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Barbería A', 'barberia-a-sync', 'barbershop', 'America/Bogota');
insert into public.reservations (id, organization_id, start_at, end_at, status, source) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001',
   '2030-01-10T15:00:00Z', '2030-01-10T15:30:00Z', 'confirmed', 'dashboard');

do $$
declare
  v_marked int;
begin
  if exists (select 1 from public.reservations where id = '55555555-0000-0000-0000-000000000001'
             and (created_sync_at is not null or cancelled_sync_at is not null)) then
    raise exception 'FAIL: una reserva nueva nace ya avisada';
  end if;

  -- Lo que hace el server: update condicional. La segunda vez no toma nada.
  update public.reservations set created_sync_at = now()
    where id = '55555555-0000-0000-0000-000000000001' and created_sync_at is null;
  update public.reservations set created_sync_at = now()
    where id = '55555555-0000-0000-0000-000000000001' and created_sync_at is null;
  get diagnostics v_marked = row_count;
  if v_marked <> 0 then
    raise exception 'FAIL: la confirmación se tomó dos veces';
  end if;
  raise notice 'OK: cada reserva nueva queda pendiente de aviso y se avisa una sola vez';
end $$;

rollback;

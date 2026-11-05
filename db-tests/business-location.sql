-- ============================================================
-- Ubicación del negocio (20261029090000): el dueño guarda indicaciones y
-- enlace de mapa; un enlace que no es https se rechaza. Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-0000000000c1', 'Barbería A', 'barberia-a-ubicacion', 'barbershop', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 'owner');
insert into public.business_profiles (organization_id, name, timezone) values
  ('11111111-aaaa-0000-0000-0000000000c1', 'Barbería A', 'America/Bogota');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

update public.business_profiles
  set address = 'Calle 10 # 43-12', address_details = 'Local 3, frente al parque', maps_url = 'https://maps.app.goo.gl/abc123'
  where organization_id = '11111111-aaaa-0000-0000-0000000000c1';
do $$ begin
  if (select maps_url from public.business_profiles where organization_id = '11111111-aaaa-0000-0000-0000000000c1') <> 'https://maps.app.goo.gl/abc123' then
    raise exception 'FAIL: el dueño no pudo guardar el enlace del mapa';
  end if;
  raise notice 'OK: el dueño guarda la dirección, las indicaciones y el enlace del mapa';
end $$;

do $$ begin
  update public.business_profiles set maps_url = 'javascript:alert(1)'
    where organization_id = '11111111-aaaa-0000-0000-0000000000c1';
  raise exception 'FAIL: se aceptó un enlace de mapa que no es https';
exception when check_violation then
  raise notice 'OK: un enlace de mapa que no es https se rechaza';
end $$;

rollback;

-- ============================================================
-- Registro autónomo: prueba gratis, módulos del rubro, slug único, una
-- prueba por persona y el dueño no puede alargarla. Revertido.
-- Usuarios: ...0201 y ...0202 (nuevos).
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'dueno1@test.co'),
  ('00000000-0000-0000-0000-000000000202', 'dueno2@test.co');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000201';
do $$ declare o public.organizations; second public.organizations; begin
  o := public.create_organization_with_owner('Antojitos Signup', 'antojitos-signup', 'restaurant', 'America/Bogota');
  if o.trial_ends_at is null or o.trial_ends_at < now() + interval '13 days' or o.subscription_expires_at <> o.trial_ends_at then
    raise exception 'FAIL: el negocio nuevo no quedó con 14 días de prueba (% / %)', o.trial_ends_at, o.subscription_expires_at;
  end if;
  if 'walk_ins' = any (o.disabled_modules) or 'public_booking' = any (o.disabled_modules) or 'reports' = any (o.disabled_modules) then
    raise exception 'FAIL: el restaurante no quedó con atención en sitio, página pública y reportes (%)', o.disabled_modules;
  end if;
  if not ('cash' = any (o.disabled_modules)) then raise exception 'FAIL: caja encendida por defecto'; end if;

  second := public.create_organization_with_owner('Antojitos Signup Dos', 'antojitos-signup', 'spa', 'America/Bogota');
  if second.slug <> 'antojitos-signup-2' then raise exception 'FAIL: slug repetido no se resolvió (%)', second.slug; end if;
  if not ('walk_ins' = any (second.disabled_modules)) or 'public_booking' = any (second.disabled_modules) then
    raise exception 'FAIL: módulos del spa (%)', second.disabled_modules;
  end if;
  if second.subscription_expires_at > now() + interval '1 minute' then
    raise exception 'FAIL: una segunda prueba gratis para la misma persona';
  end if;
  raise notice 'OK: prueba de 14 días, módulos del rubro, slug único y una prueba por persona';

  begin
    update public.organizations set trial_ends_at = now() + interval '1 year' where id = o.id;
    raise exception 'FAIL: el dueño alargó su prueba';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'OK: el dueño no puede alargar la prueba';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000202';
do $$ declare o public.organizations; begin
  o := public.create_organization_with_owner('Otra Persona', 'otra-persona-signup', 'car_wash', 'America/Bogota');
  if o.trial_ends_at < now() + interval '13 days' then raise exception 'FAIL: otra persona sin prueba'; end if;
  raise notice 'OK: cada persona nueva tiene su prueba';
end $$;

rollback;

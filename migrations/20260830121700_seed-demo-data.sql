-- ============================================================
-- Seed de desarrollo: 3 organizaciones demo de tipos de negocio distintos,
-- SIN owner asignado (no se fabrican filas de auth.users acá: el esquema
-- exacto de auth.users depende de la versión de InsForge y no se pudo
-- verificar contra un proyecto real en este entorno).
--
-- Flujo recomendado: registrate normalmente en la app y después llamá
-- claim_demo_organization(<id>) para convertirte en owner de una de estas
-- 3 organizaciones y explorar datos ya cargados (horarios, servicios,
-- recursos).
-- ============================================================
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('22222222-2222-2222-2222-222222222201', 'La Buena Mesa', 'la-buena-mesa', 'restaurant', 'America/Bogota'),
  ('22222222-2222-2222-2222-222222222202', 'Barbería El Corte', 'barberia-el-corte', 'barbershop', 'America/Bogota'),
  ('22222222-2222-2222-2222-222222222203', 'Bella Studio', 'bella-studio', 'beauty_salon', 'America/Bogota')
on conflict (id) do nothing;

insert into public.business_profiles (
  organization_id, name, description, address, phone, email, business_type, category,
  currency, timezone, capacity_total, reservation_duration_minutes, slot_interval_minutes,
  advance_booking_hours, max_booking_days, cancellation_policy
) values
  (
    '22222222-2222-2222-2222-222222222201', 'La Buena Mesa',
    'Restaurante de cocina colombiana contemporánea.', 'Cra 10 # 20-30, Bogotá',
    '+573001112233', 'contacto@labuenamesa.test', 'restaurant', 'Restaurante',
    'COP', 'America/Bogota', null, 90, 30, 2, 30,
    'Cancelaciones con menos de 2 horas de anticipación pueden no ser reembolsables.'
  ),
  (
    '22222222-2222-2222-2222-222222222202', 'Barbería El Corte',
    'Barbería clásica con atención personalizada.', 'Calle 45 # 12-08, Bogotá',
    '+573004445566', 'contacto@elcorte.test', 'barbershop', 'Barbería',
    'COP', 'America/Bogota', null, 45, 30, 1, 45, 'Reprogramaciones sin costo hasta 1 hora antes.'
  ),
  (
    '22222222-2222-2222-2222-222222222203', 'Bella Studio',
    'Salón de belleza integral: cabello, uñas y piel.', 'Av. Siempre Viva 742, Bogotá',
    '+573007778899', 'contacto@bellastudio.test', 'beauty_salon', 'Salón de belleza',
    'COP', 'America/Bogota', null, 60, 30, 2, 60, 'Se solicita puntualidad; tolerancia máxima de 10 minutos.'
  )
on conflict (organization_id) do update set
  name = excluded.name,
  description = excluded.description;

insert into public.business_hour_periods (organization_id, day_of_week, is_closed, opening_time, closing_time)
select '22222222-2222-2222-2222-222222222201'::uuid, dow, true, null::time, null::time from generate_series(0, 0) as dow
union all
select '22222222-2222-2222-2222-222222222201'::uuid, dow, false, '12:00'::time, '15:30'::time from generate_series(1, 6) as dow
union all
select '22222222-2222-2222-2222-222222222201'::uuid, dow, false, '19:00'::time, '23:00'::time from generate_series(1, 6) as dow
union all
select '22222222-2222-2222-2222-222222222202'::uuid, dow, true, null::time, null::time from generate_series(0, 0) as dow
union all
select '22222222-2222-2222-2222-222222222202'::uuid, dow, false, '09:00'::time, '19:00'::time from generate_series(1, 6) as dow
union all
select '22222222-2222-2222-2222-222222222203'::uuid, dow, true, null::time, null::time from generate_series(0, 0) as dow
union all
select '22222222-2222-2222-2222-222222222203'::uuid, dow, false, '09:00'::time, '18:00'::time from generate_series(1, 6) as dow;

insert into public.resources (organization_id, name, resource_type, capacity) values
  ('22222222-2222-2222-2222-222222222201', 'Mesa 1', 'table', 2),
  ('22222222-2222-2222-2222-222222222201', 'Mesa 2', 'table', 4),
  ('22222222-2222-2222-2222-222222222201', 'Mesa 3', 'table', 4),
  ('22222222-2222-2222-2222-222222222201', 'Mesa 4', 'table', 6),
  ('22222222-2222-2222-2222-222222222202', 'Barbero Juan', 'staff', 1),
  ('22222222-2222-2222-2222-222222222202', 'Barbero Carlos', 'staff', 1),
  ('22222222-2222-2222-2222-222222222203', 'Estilista Ana', 'staff', 1),
  ('22222222-2222-2222-2222-222222222203', 'Estilista Laura', 'staff', 1);

insert into public.services (organization_id, name, description, duration_minutes, price, currency) values
  ('22222222-2222-2222-2222-222222222201', 'Reserva de mesa', 'Reserva estándar de mesa', 90, 0, 'COP'),
  ('22222222-2222-2222-2222-222222222202', 'Corte', 'Corte de cabello clásico', 30, 35000, 'COP'),
  ('22222222-2222-2222-2222-222222222202', 'Corte + Barba', 'Corte de cabello y arreglo de barba', 45, 55000, 'COP'),
  ('22222222-2222-2222-2222-222222222203', 'Manicura', 'Manicura completa', 45, 40000, 'COP'),
  ('22222222-2222-2222-2222-222222222203', 'Corte y Peinado', 'Corte y peinado profesional', 60, 70000, 'COP');

update public.agents set name = 'Sofía', tone = 'friendly', language = 'es'
  where organization_id = '22222222-2222-2222-2222-222222222201';
update public.agents set name = 'Max', tone = 'casual', language = 'es'
  where organization_id = '22222222-2222-2222-2222-222222222202';
update public.agents set name = 'Bella', tone = 'friendly', language = 'es'
  where organization_id = '22222222-2222-2222-2222-222222222203';

-- ============================================================
-- claim_demo_organization: permite a CUALQUIER usuario autenticado
-- convertirse en owner de una de las 3 organizaciones demo, siempre que
-- todavía no tenga owner. Sólo funciona sobre las 3 orgs sembradas acá
-- (evita que se use como una puerta trasera para tomar control de una
-- organización real de otro negocio).
-- ============================================================
create or replace function public.claim_demo_organization(p_organization_id uuid)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_org public.organizations;
  v_has_owner boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere autenticación' using errcode = '28000';
  end if;

  if p_organization_id not in (
    '22222222-2222-2222-2222-222222222201',
    '22222222-2222-2222-2222-222222222202',
    '22222222-2222-2222-2222-222222222203'
  ) then
    raise exception 'Esta organización no está disponible para reclamar' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and role = 'owner'
  ) into v_has_owner;

  if v_has_owner then
    raise exception 'Esta organización demo ya tiene un owner' using errcode = '42501';
  end if;

  -- guard_organization_members() permite este INSERT/UPDATE sin más porque
  -- ya validamos arriba que la organización no tiene ningún owner.
  insert into public.organization_members (organization_id, user_id, role)
  values (p_organization_id, (select auth.uid()), 'owner')
  on conflict (organization_id, user_id) do update set role = 'owner';

  select * into v_org from public.organizations where id = p_organization_id;
  return v_org;
end;
$$;

grant execute on function public.claim_demo_organization(uuid) to authenticated;

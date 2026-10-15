-- ============================================================
-- Registro autónomo: un negocio se crea solo, con prueba gratis y los
-- módulos de su rubro encendidos, sin pasar por soporte.
--
-- 1. organizations.trial_ends_at: fin de la prueba gratis (null = negocios
--    creados antes de esto, que no cambian). La prueba también fija
--    subscription_expires_at, así el vencimiento automático y el pago por
--    comprobante funcionan igual que siempre: pagar extiende desde el fin de
--    la prueba. "Está en prueba" = subscription_expires_at <= trial_ends_at.
-- 2. Módulos recomendados por rubro al crear el negocio (antes había que
--    pedirle a soporte que encendiera la atención en sitio o la página
--    pública). Soporte puede seguir cambiándolos después.
-- 3. Slug único aunque dos negocios se llamen igual (antes fallaba el alta
--    con "duplicate key").
-- 4. Una prueba por persona: si quien crea el negocio ya tuvo una prueba
--    en otro negocio propio, el nuevo arranca sin prueba (vence ya y pide
--    el pago).
-- ============================================================

alter table public.organizations
  add column if not exists trial_ends_at timestamptz;

-- Días de prueba gratis para negocios nuevos.
create or replace function public.signup_trial_days()
returns integer
language sql
immutable
as $$ select 14 $$;

-- Módulos opcionales que quedan APAGADOS al crear un negocio de este rubro.
-- Encendidos para todos: página pública y reportes. Atención en sitio, solo
-- en los rubros donde la gente llega sin cita. Planes, caja, opiniones y
-- recuperar clientes siguen apagados (los enciende soporte).
create or replace function public.signup_disabled_modules(p_business_type text)
returns text[]
language sql
immutable
as $$
  select case
    when p_business_type in ('restaurant', 'barbershop', 'beauty_salon', 'car_wash', 'auto_repair')
      then array['plans', 'cash', 'surveys', 'reactivation']::text[]
    else array['walk_ins', 'plans', 'cash', 'surveys', 'reactivation']::text[]
  end
$$;

-- Slug libre: "antojitos", "antojitos-2", "antojitos-3"...
create or replace function public.available_organization_slug(p_slug text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_base text := coalesce(nullif(p_slug, ''), 'negocio');
  v_candidate text := v_base;
  v_n integer := 1;
begin
  while exists (select 1 from public.organizations where slug = v_candidate) loop
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;
  return v_candidate;
end;
$$;

revoke all on function public.available_organization_slug(text) from public;

create or replace function public.create_organization_with_owner(
  p_name text,
  p_slug text,
  p_business_type text default 'other',
  p_timezone text default 'America/Bogota'
)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_org public.organizations;
  v_uid uuid := (select auth.uid());
  v_type text := coalesce(p_business_type, 'other');
  v_had_trial boolean;
  v_trial_end timestamptz;
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.organizations o
    join public.organization_members m on m.organization_id = o.id
    where m.user_id = v_uid and m.role = 'owner' and o.trial_ends_at is not null
  ) into v_had_trial;

  v_trial_end := case when v_had_trial then now() else now() + make_interval(days => public.signup_trial_days()) end;

  insert into public.organizations (name, slug, business_type, timezone, disabled_modules, trial_ends_at, subscription_expires_at)
  values (
    p_name,
    public.available_organization_slug(p_slug),
    v_type,
    coalesce(p_timezone, 'America/Bogota'),
    public.signup_disabled_modules(v_type),
    v_trial_end,
    v_trial_end
  )
  returning * into v_org;

  -- guard_organization_members() permite este INSERT sin más porque la
  -- organización recién creada todavía no tiene ningún miembro.
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_uid, 'owner');

  insert into public.business_profiles (organization_id, name, business_type, timezone)
  values (v_org.id, p_name, v_type, coalesce(p_timezone, 'America/Bogota'))
  on conflict (organization_id) do nothing;

  return v_org;
end;
$$;

grant execute on function public.create_organization_with_owner(text, text, text, text) to authenticated;

-- El dueño no puede alargarse la prueba (igual que el estado y el vencimiento).
create or replace function public.restrict_owner_billing_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if (new.status is distinct from old.status
      or new.subscription_expires_at is distinct from old.subscription_expires_at
      or new.trial_ends_at is distinct from old.trial_ends_at)
    and public.is_org_admin_or_owner(new.id)
    and not public.is_support_staff()
  then
    raise exception 'El estado y el vencimiento de la suscripción solo los puede cambiar soporte';
  end if;
  return new;
end;
$$;

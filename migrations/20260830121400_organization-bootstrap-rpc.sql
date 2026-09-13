-- ============================================================
-- create_organization_with_owner
--
-- Único punto de entrada permitido para crear una organización nueva.
-- Crea la organización y el primer organization_member (role='owner')
-- de forma atómica, evitando el problema del huevo-y-la-gallina que
-- impediría a un INSERT directo de 'organizations' pasar sus propias
-- policies (que exigen ya ser miembro).
-- ============================================================
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
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere autenticación' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, business_type, timezone)
  values (p_name, p_slug, coalesce(p_business_type, 'other'), coalesce(p_timezone, 'America/Bogota'))
  returning * into v_org;

  -- guard_organization_members() permite este INSERT sin más porque la
  -- organización recién creada todavía no tiene ningún miembro.
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, (select auth.uid()), 'owner');

  insert into public.business_profiles (organization_id, name, business_type, timezone)
  values (v_org.id, p_name, p_business_type, coalesce(p_timezone, 'America/Bogota'))
  on conflict (organization_id) do nothing;

  return v_org;
end;
$$;

grant execute on function public.create_organization_with_owner(text, text, text, text) to authenticated;

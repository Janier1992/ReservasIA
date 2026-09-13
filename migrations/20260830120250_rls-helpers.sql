-- ============================================================
-- Funciones auxiliares de autorización multi-tenant (RLS)
--
-- SECURITY DEFINER es intencional: permiten consultar
-- organization_members desde las policies de la propia tabla
-- organization_members (y de todas las demás) sin recursión,
-- porque se ejecutan con el rol dueño de la función (bypassa RLS).
--
-- SET search_path = pg_catalog, public, pg_temp según la convención de
-- InsForge para funciones SECURITY DEFINER (evita hijacking de search_path).
--
-- IMPORTANTE: estas funciones son `language sql`, que a diferencia de
-- `plpgsql` se validan contra el esquema real en el momento de CREATE
-- FUNCTION. Por eso esta migración corre DESPUÉS de crear
-- organization_members (20260830120200) y ANTES de cualquier policy que
-- las use (20260830120260 en adelante).
-- ============================================================

create or replace function public.get_user_organization_ids()
returns setof uuid
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select organization_id
  from public.organization_members
  where user_id = (select auth.uid());
$$;

grant execute on function public.get_user_organization_ids() to authenticated;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;

create or replace function public.get_user_role(p_organization_id uuid)
returns text
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = (select auth.uid())
  limit 1;
$$;

grant execute on function public.get_user_role(uuid) to authenticated;

create or replace function public.is_org_admin_or_owner(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_org_admin_or_owner(uuid) to authenticated;

create or replace function public.is_org_owner(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

grant execute on function public.is_org_owner(uuid) to authenticated;

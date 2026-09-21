-- ============================================================
-- Da al panel de soporte la capacidad de suspender/reactivar y eliminar
-- negocios. Suspender es reversible y lo puede hacer cualquier miembro
-- activo de support_staff; eliminar es irreversible (cascade sobre TODA la
-- data del negocio) y se reserva a role='admin'.
-- ============================================================

create or replace function public.is_support_admin()
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.support_staff
    where user_id = (select auth.uid())
      and active
      and role = 'admin'
  );
$$;

grant execute on function public.is_support_admin() to authenticated;

-- ------------------------------------------------------------
-- Suspender/reactivar: UPDATE de organizations para soporte, pero
-- restringido por trigger a la columna "status" (mismo criterio que
-- restrict_support_agent_update para agents — RLS no filtra por columna).
-- ------------------------------------------------------------
drop policy if exists "organizations_update_support" on public.organizations;
create policy "organizations_update_support"
  on public.organizations for update
  to authenticated
  using (public.is_support_staff())
  with check (public.is_support_staff());

create or replace function public.restrict_support_org_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if public.is_org_admin_or_owner(new.id) then
    return new;
  end if;

  if new.name is distinct from old.name
    or new.slug is distinct from old.slug
    or new.business_type is distinct from old.business_type
    or new.timezone is distinct from old.timezone
  then
    raise exception 'support_staff solo puede modificar la columna status de organizations';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restrict_support_org_update on public.organizations;
create trigger trg_restrict_support_org_update
  before update on public.organizations
  for each row execute function public.restrict_support_org_update();

-- ------------------------------------------------------------
-- Eliminar negocio: solo admins de soporte. Sumado a "organizations_delete_owner"
-- ya existente (el dueño también puede borrar su propia cuenta).
-- ------------------------------------------------------------
drop policy if exists "organizations_delete_support_admin" on public.organizations;
create policy "organizations_delete_support_admin"
  on public.organizations for delete
  to authenticated
  using (public.is_support_admin());

-- ============================================================
-- RLS policies de organization_members (requiere las funciones de
-- 20260830120250_rls-helpers.sql).
-- ============================================================

-- SELECT: cualquier miembro puede ver la lista de miembros de sus organizaciones.
create policy "org_members_select_same_org"
  on public.organization_members for select
  to authenticated
  using (organization_id in (select public.get_user_organization_ids()));

-- INSERT (invitar usuario): admin u owner de esa organización.
create policy "org_members_insert_admin"
  on public.organization_members for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id));

-- UPDATE (cambiar rol): admin u owner. La restricción de que un staff no
-- pueda auto-promoverse y de que sólo el owner pueda nombrar otro owner
-- se aplica en el trigger guard_organization_members (ver migración de
-- la tabla).
create policy "org_members_update_admin"
  on public.organization_members for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

-- DELETE (revocar acceso): admin u owner.
create policy "org_members_delete_admin"
  on public.organization_members for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.organization_members to authenticated;

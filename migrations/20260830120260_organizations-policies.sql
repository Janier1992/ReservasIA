-- ============================================================
-- RLS policies de organizations (requiere las funciones de
-- 20260830120250_rls-helpers.sql).
-- ============================================================

-- SELECT: solo miembros de la organización.
create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (id in (select public.get_user_organization_ids()));

-- UPDATE: admin u owner.
create policy "organizations_update_admin"
  on public.organizations for update
  to authenticated
  using (public.is_org_admin_or_owner(id))
  with check (public.is_org_admin_or_owner(id));

-- DELETE: solo owner.
create policy "organizations_delete_owner"
  on public.organizations for delete
  to authenticated
  using (public.is_org_owner(id));

-- No se define policy de INSERT para 'authenticated': la creación de una
-- organización se realiza exclusivamente a través del RPC
-- create_organization_with_owner (SECURITY DEFINER), que también crea el
-- primer organization_member con role='owner' de forma atómica. Esto evita
-- el problema del huevo-y-la-gallina (no puedes ser miembro de algo que
-- todavía no existe) y evita que un usuario cree una organización "huérfana".

grant select, update, delete on public.organizations to authenticated;

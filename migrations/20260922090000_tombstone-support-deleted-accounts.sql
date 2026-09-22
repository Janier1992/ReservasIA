-- ============================================================
-- Cuando soporte elimina un negocio (organizations_delete_support_admin),
-- el cascade borra organization_members/agents/etc. pero NUNCA borra las
-- cuentas de auth.users de sus miembros — InsForge no expone ninguna forma
-- de eliminar/editar un usuario de auth vía SDK ni REST (ver
-- project_insforge_platform_limits). Sin este tombstone, esa misma persona
-- podía volver a iniciar sesión con la misma cuenta y, al no tener ninguna
-- organización, el frontend la mandaba derecho al wizard de onboarding
-- para crear un negocio nuevo — dejando sin efecto la baja que hizo
-- soporte.
--
-- Solo se marca cuando el DELETE lo hace un admin de soporte
-- (is_support_admin()), nunca cuando un owner borra su propia cuenta
-- (self-service, policy organizations_delete_owner ya existente): ese caso
-- sí debe poder volver a registrarse/crear un negocio sin fricción.
-- ============================================================

create table if not exists public.deleted_user_accounts (
  user_id uuid primary key,
  deleted_at timestamptz not null default now(),
  reason text
);

alter table public.deleted_user_accounts enable row level security;

-- Solo puede leer su propia fila (para que el frontend decida si le
-- muestra la pantalla de "cuenta eliminada" en vez de mandarlo a
-- onboarding). Sin policies de insert/update/delete para `authenticated`:
-- solo el trigger de abajo (security definer) escribe acá.
drop policy if exists "deleted_user_accounts_select_self" on public.deleted_user_accounts;
create policy "deleted_user_accounts_select_self"
  on public.deleted_user_accounts for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.deleted_user_accounts to authenticated;

create or replace function public.tombstone_members_on_support_org_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if public.is_support_admin() then
    insert into public.deleted_user_accounts (user_id, reason)
    select user_id, 'organization_deleted_by_support'
    from public.organization_members
    where organization_id = old.id
    on conflict (user_id) do nothing;
  end if;
  return old;
end;
$$;

-- BEFORE DELETE: organization_members todavía existe para esta
-- organización en este momento (el cascade hacia esa tabla ocurre después).
drop trigger if exists trg_tombstone_members_on_org_delete on public.organizations;
create trigger trg_tombstone_members_on_org_delete
  before delete on public.organizations
  for each row execute function public.tombstone_members_on_support_org_delete();

-- ============================================================
-- organization_invites: invitaciones de equipo por email.
--
-- InsForge no expone auth.users vía el data API ni un auth.admin.* en el
-- SDK (verificado contra los .d.ts reales del paquete), así que no hay
-- forma de resolver email -> user_id desde código de aplicación para
-- insertar directamente en organization_members a nombre de otra persona.
--
-- En su lugar: el owner/admin crea una invitación (email + rol). Cuando la
-- persona invitada inicia sesión con ESE email, ve su invitación pendiente
-- (policy que compara contra su propio email vía current_user_email(), un
-- helper SECURITY DEFINER que sí puede leer auth.users) y la acepta con la
-- RPC accept_organization_invite(), que inserta organization_members con
-- su propio auth.uid() (nunca con un user_id ajeno).
-- ============================================================
create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select email from auth.users where id = (select auth.uid());
$$;

grant execute on function public.current_user_email() to authenticated;

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'staff',
  status text not null default 'pending',
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_invites_role_check check (role in ('admin', 'staff')),
  constraint organization_invites_status_check check (status in ('pending', 'accepted', 'revoked')),
  constraint organization_invites_org_email_unique unique (organization_id, email)
);

create index if not exists idx_org_invites_email on public.organization_invites (lower(email));
create index if not exists idx_org_invites_org on public.organization_invites (organization_id);

alter table public.organization_invites enable row level security;

drop trigger if exists trg_organization_invites_updated_at on public.organization_invites;
create trigger trg_organization_invites_updated_at
  before update on public.organization_invites
  for each row execute function system.update_updated_at();

-- admin/owner ven y gestionan las invitaciones de su organización.
create policy "org_invites_select_admin"
  on public.organization_invites for select
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

create policy "org_invites_insert_admin"
  on public.organization_invites for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id) and invited_by = (select auth.uid()));

create policy "org_invites_delete_admin"
  on public.organization_invites for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

-- Cualquier usuario autenticado puede ver (sólo) las invitaciones dirigidas
-- a su propio email, para poder aceptarlas.
create policy "org_invites_select_own_email"
  on public.organization_invites for select
  to authenticated
  using (status = 'pending' and lower(email) = lower(public.current_user_email()));

grant select, insert, delete on public.organization_invites to authenticated;

create or replace function public.accept_organization_invite(p_invite_id uuid)
returns public.organization_members
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_invite public.organization_invites;
  v_member public.organization_members;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere autenticación' using errcode = '28000';
  end if;

  select * into v_invite from public.organization_invites where id = p_invite_id for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'INVITE_NOT_PENDING' using errcode = 'P0001';
  end if;

  if lower(v_invite.email) <> lower(public.current_user_email()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- organization_invites.role sólo admite 'admin'/'staff' (constraint),
  -- nunca 'owner', así que la validación de asignación de owner en
  -- guard_organization_members() nunca se activa acá.
  insert into public.organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, (select auth.uid()), v_invite.role)
  on conflict (organization_id, user_id) do update set role = excluded.role
  returning * into v_member;

  update public.organization_invites set status = 'accepted' where id = p_invite_id;

  return v_member;
end;
$$;

grant execute on function public.accept_organization_invite(uuid) to authenticated;

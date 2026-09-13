-- ============================================================
-- organization_members: relación N:M user <-> organization con rol
--
-- Las RLS policies de esta tabla viven en
-- 20260830120270_organization-members-policies.sql (después de crear las
-- funciones auxiliares en 20260830120250_rls-helpers.sql). El trigger de
-- guarda de abajo sí puede vivir acá: es `language plpgsql`, cuyo cuerpo
-- Postgres NO valida contra el esquema hasta la primera ejecución (a
-- diferencia de `language sql`, que se valida en CREATE FUNCTION).
-- ============================================================
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff',
  created_at timestamptz not null default now(),
  constraint organization_members_role_check check (role in ('owner', 'admin', 'staff')),
  constraint organization_members_org_user_unique unique (organization_id, user_id)
);

create index if not exists idx_org_members_user on public.organization_members (user_id);
create index if not exists idx_org_members_org on public.organization_members (organization_id);

alter table public.organization_members enable row level security;

-- ============================================================
-- Invariantes críticas:
--   1. Sólo un owner puede asignar el rol 'owner' a otra fila.
--   2. Nunca se puede quedar una organización sin ningún owner.
-- ============================================================
create or replace function public.guard_organization_members()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_remaining_owners integer;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.role = 'owner' and not public.is_org_owner(new.organization_id) then
      -- Excepción: la primera fila de una organización recién creada la
      -- inserta el RPC create_organization_with_owner (SECURITY DEFINER),
      -- que señaliza el bypass con una GUC de sesión (ver ese RPC).
      if coalesce(current_setting('app.bypass_member_guard', true), 'off') <> 'on' then
        raise exception 'Solo un owner puede asignar el rol owner' using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    select count(*) into v_remaining_owners
    from public.organization_members
    where organization_id = old.organization_id
      and role = 'owner'
      and id <> old.id;
    if v_remaining_owners = 0 then
      raise exception 'La organización debe conservar al menos un owner' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' then
    select count(*) into v_remaining_owners
    from public.organization_members
    where organization_id = old.organization_id
      and role = 'owner'
      and id <> old.id;
    if v_remaining_owners = 0 then
      raise exception 'La organización debe conservar al menos un owner' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_organization_members on public.organization_members;
create trigger trg_guard_organization_members
  before insert or update or delete on public.organization_members
  for each row execute function public.guard_organization_members();

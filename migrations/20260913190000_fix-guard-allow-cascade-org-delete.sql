-- ============================================================
-- Corrige guard_organization_members(): el chequeo de "la organización
-- debe conservar al menos un owner" no distinguía entre borrar al owner
-- mientras la organización sigue existiendo (debe bloquearse) y borrar la
-- organización completa, cuyo DELETE en cascada sobre organization_members
-- dispara este mismo trigger para la fila del owner (no debe bloquearse:
-- no hay nada que proteger si la organización ya no existe).
--
-- Cuando Postgres ejecuta el ON DELETE CASCADE de organizations hacia
-- organization_members, la fila de organizations ya fue eliminada antes de
-- que este trigger corra sobre la fila hija, así que basta con comprobar
-- si la organización todavía existe para distinguir ambos casos.
-- ============================================================
create or replace function public.guard_organization_members()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_remaining_owners integer;
  v_existing_members integer;
  v_organization_exists boolean;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.role = 'owner' and not public.is_org_owner(new.organization_id) then
      select count(*) into v_existing_members
      from public.organization_members
      where organization_id = new.organization_id
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

      if v_existing_members > 0 then
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
    select exists (select 1 from public.organizations where id = old.organization_id) into v_organization_exists;

    if v_organization_exists then
      select count(*) into v_remaining_owners
      from public.organization_members
      where organization_id = old.organization_id
        and role = 'owner'
        and id <> old.id;
      if v_remaining_owners = 0 then
        raise exception 'La organización debe conservar al menos un owner' using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

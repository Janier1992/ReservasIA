-- ============================================================
-- Corrige guard_organization_members(): el mecanismo original de bypass
-- vía variable de sesión personalizada no es viable en este backend.
--
-- Reemplazo: permitir asignar role='owner' sin ya ser owner SÓLO cuando la
-- organización todavía no tiene NINGÚN miembro (el caso legítimo de
-- bootstrap: create_organization_with_owner sobre una organización recién
-- creada, o claim_demo_organization sobre una demo sin owner). Esto es
-- seguro porque:
--   - create_organization_with_owner siempre inserta sobre una
--     organización flamante (0 miembros por definición).
--   - claim_demo_organization ya valida explícitamente que no exista un
--     owner antes de insertar.
--   - Un INSERT directo de un cliente vía RLS normal exige
--     is_org_admin_or_owner(organization_id), que es imposible de
--     satisfacer si la organización tiene 0 miembros (nadie es admin/owner
--     todavía) — así que este camino nunca queda expuesto a un intento
--     malicioso vía la API pública.
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

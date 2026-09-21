-- ============================================================
-- La policy "agents_update_support" (ver 20260919160000_support-staff.sql)
-- autoriza a soporte a hacer UPDATE sobre la fila de agents de cualquier
-- negocio, pero RLS no puede restringir A QUÉ COLUMNAS: técnicamente
-- alcanzaba para reescribir name/system_instructions/etc. de cualquier
-- negocio, no solo pausar/reactivar. La UI de soporte solo expone el
-- toggle de "enabled", pero si esa cuenta se ve comprometida, alguien
-- podría llamar a la API directamente y tocar cualquier campo.
--
-- La restricción por columna en Postgres se hace con un trigger (RLS no
-- tiene "column-level policies" para esto), que compara NEW contra OLD y
-- bloquea el UPDATE si cambió algo más que "enabled" — pero SOLO cuando
-- quien edita no es owner/admin de esa organización. Los dueños de negocio
-- siguen pudiendo editar su propio agente sin ninguna restricción nueva.
-- ============================================================

create or replace function public.restrict_support_agent_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if public.is_org_admin_or_owner(new.organization_id) then
    return new;
  end if;

  -- A esta altura, si el UPDATE fue autorizado, solo pudo ser vía la
  -- policy de soporte (agents_update_support exige is_support_staff()).
  -- Cualquier columna que no sea "enabled" debe quedar igual a como estaba.
  if new.organization_id is distinct from old.organization_id
    or new.name is distinct from old.name
    or new.language is distinct from old.language
    or new.tone is distinct from old.tone
    or new.system_instructions is distinct from old.system_instructions
    or new.booking_enabled is distinct from old.booking_enabled
    or new.cancellation_enabled is distinct from old.cancellation_enabled
    or new.rescheduling_enabled is distinct from old.rescheduling_enabled
  then
    raise exception 'support_staff solo puede modificar la columna enabled de agents';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restrict_support_agent_update on public.agents;
create trigger trg_restrict_support_agent_update
  before update on public.agents
  for each row execute function public.restrict_support_agent_update();

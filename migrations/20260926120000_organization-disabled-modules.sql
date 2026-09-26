-- ============================================================
-- Módulos del dashboard activables por soporte. Cada negocio ve en su menú
-- solo los módulos que no estén en disabled_modules (Inicio, Reservas y
-- Configuración son la base y no se pueden apagar).
--
-- Se guarda la lista de APAGADOS: '{}' (el default) = todo activo, así los
-- negocios existentes no cambian con esta migración.
-- ============================================================

alter table public.organizations
  add column if not exists disabled_modules text[] not null default '{}';

-- Solo claves conocidas (app/src/lib/modules.ts): un typo desde el panel de
-- soporte falla acá en vez de quedar guardado sin efecto.
alter table public.organizations
  drop constraint if exists organizations_disabled_modules_known;
alter table public.organizations
  add constraint organizations_disabled_modules_known
  check (disabled_modules <@ array['inbox', 'customers', 'services', 'resources', 'agent', 'integrations', 'team']::text[]);

-- ------------------------------------------------------------
-- Qué módulos tiene un negocio lo decide soporte, no el negocio: el dueño
-- ya puede hacer UPDATE de su organización (organizations_update_admin)
-- y RLS no filtra por columna, así que un trigger bloquea que un
-- owner/admin cambie esta columna salvo que además sea support_staff. El
-- compute service (clave admin, sin usuario) no es miembro, así que pasa.
-- ------------------------------------------------------------
create or replace function public.restrict_disabled_modules_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.disabled_modules is distinct from old.disabled_modules
    and public.is_org_admin_or_owner(new.id)
    and not public.is_support_staff()
  then
    raise exception 'Solo soporte puede activar o desactivar módulos de un negocio';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_disabled_modules_update on public.organizations;
create trigger trg_restrict_disabled_modules_update
  before update on public.organizations
  for each row execute function public.restrict_disabled_modules_update();

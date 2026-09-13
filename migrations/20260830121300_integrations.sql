-- ============================================================
-- integrations: credenciales/estado de integraciones externas por tenant
-- (twilio, google_calendar, futuras...)
-- ============================================================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  provider text not null,

  status text not null default 'disconnected',

  -- Contiene tokens/credenciales sensibles. Ver el REVOKE/GRANT de columnas
  -- más abajo: ni siquiera admin/owner puede leer esta columna vía el data
  -- API. Sólo el compute service y las Edge Functions (createAdminClient,
  -- project_admin) la leen/escriben.
  credentials jsonb not null default '{}'::jsonb,

  metadata jsonb not null default '{}'::jsonb,

  connected_at timestamptz,

  updated_at timestamptz not null default now(),

  constraint integrations_status_check check (status in ('disconnected', 'connected', 'error')),
  constraint integrations_org_provider_unique unique (organization_id, provider)
);

create index if not exists idx_integrations_org on public.integrations (organization_id);

alter table public.integrations enable row level security;

drop trigger if exists trg_integrations_updated_at on public.integrations;
create trigger trg_integrations_updated_at
  before update on public.integrations
  for each row execute function system.update_updated_at();

-- Solo admin/owner pueden ver el estado de integraciones (staff no tiene
-- acceso ni siquiera de lectura: punto 4 y 48 del prompt maestro).
create policy "integrations_select_admin"
  on public.integrations for select
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

-- No hay policies de INSERT/UPDATE/DELETE para 'authenticated': todas las
-- escrituras (que incluyen manejo de `credentials`) pasan exclusivamente
-- por las Edge Functions (twilio-connect, twilio-disconnect,
-- google-oauth-start, google-disconnect) usando createAdminClient.
-- Revoca el SELECT de tabla completa (privilegio amplio por defecto de
-- InsForge) y otorga sólo las columnas seguras: `credentials` nunca queda
-- alcanzable vía el data API, ni siquiera para admin/owner.
revoke select on public.integrations from authenticated;
grant select (id, organization_id, provider, status, metadata, connected_at) on public.integrations to authenticated;

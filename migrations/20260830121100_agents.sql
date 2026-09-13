-- ============================================================
-- agents: configuración del agente de IA de cada organización (1:1)
-- ============================================================
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,

  name text not null default 'Valentina',

  enabled boolean not null default true,

  language text not null default 'es',

  tone text not null default 'friendly',

  system_instructions text,

  booking_enabled boolean not null default true,

  cancellation_enabled boolean not null default true,

  rescheduling_enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agents enable row level security;

drop trigger if exists trg_agents_updated_at on public.agents;
create trigger trg_agents_updated_at
  before update on public.agents
  for each row execute function system.update_updated_at();

create policy "agents_select_member"
  on public.agents for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "agents_update_admin"
  on public.agents for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

-- No hay policy/grant de INSERT/DELETE para 'authenticated': la fila de
-- agente se crea automáticamente junto con la organización (ver trigger
-- más abajo) y vive/muere con ella (ON DELETE CASCADE).
grant select, update on public.agents to authenticated;

create or replace function public.create_default_agent_for_org()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.agents (organization_id, name)
  values (new.id, 'Valentina')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_default_agent on public.organizations;
create trigger trg_create_default_agent
  after insert on public.organizations
  for each row execute function public.create_default_agent_for_org();

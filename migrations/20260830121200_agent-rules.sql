-- ============================================================
-- agent_rules: reglas de negocio adicionales configurables sin código
-- ============================================================
create table if not exists public.agent_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  instruction text not null,
  priority integer not null default 100,
  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_rules_org on public.agent_rules (organization_id, priority);

alter table public.agent_rules enable row level security;

drop trigger if exists trg_agent_rules_updated_at on public.agent_rules;
create trigger trg_agent_rules_updated_at
  before update on public.agent_rules
  for each row execute function system.update_updated_at();

create policy "agent_rules_select_member"
  on public.agent_rules for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "agent_rules_insert_admin"
  on public.agent_rules for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id));

create policy "agent_rules_update_admin"
  on public.agent_rules for update
  to authenticated
  using (public.is_org_admin_or_owner(organization_id))
  with check (public.is_org_admin_or_owner(organization_id));

create policy "agent_rules_delete_admin"
  on public.agent_rules for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.agent_rules to authenticated;

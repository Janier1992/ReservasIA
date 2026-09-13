-- ============================================================
-- conversations: hilo de conversación por canal (whatsapp, web, ...)
-- ============================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  customer_id uuid references public.customers(id) on delete set null,

  channel text not null,
  external_conversation_id text,

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_channel_check check (channel in ('whatsapp', 'instagram', 'web', 'telegram', 'facebook')),
  constraint conversations_status_check check (status in ('active', 'closed', 'archived'))
);

create index if not exists idx_conversations_org on public.conversations (organization_id);
create index if not exists idx_conversations_org_status on public.conversations (organization_id, status);
create index if not exists idx_conversations_customer on public.conversations (customer_id);
create unique index if not exists uq_conversations_org_channel_external
  on public.conversations (organization_id, channel, external_conversation_id)
  where external_conversation_id is not null;

alter table public.conversations enable row level security;

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function system.update_updated_at();

create policy "conversations_select_member"
  on public.conversations for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "conversations_insert_member"
  on public.conversations for insert
  to authenticated
  with check (public.is_org_member(organization_id));

create policy "conversations_update_member"
  on public.conversations for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "conversations_delete_admin"
  on public.conversations for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, update, delete on public.conversations to authenticated;

-- ============================================================
-- messages: mensajes individuales dentro de una conversación
-- ============================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  conversation_id uuid not null references public.conversations(id) on delete cascade,

  role text not null,

  content text not null,

  message_type text not null default 'text',

  external_message_id text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint messages_role_check check (role in ('user', 'assistant', 'system', 'tool', 'staff'))
);

create index if not exists idx_messages_org on public.messages (organization_id);
create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "messages_select_member"
  on public.messages for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "messages_insert_member"
  on public.messages for insert
  to authenticated
  with check (public.is_org_member(organization_id));

-- Los mensajes son inmutables una vez creados (no UPDATE policy, no UPDATE grant).

create policy "messages_delete_admin"
  on public.messages for delete
  to authenticated
  using (public.is_org_admin_or_owner(organization_id));

grant select, insert, delete on public.messages to authenticated;

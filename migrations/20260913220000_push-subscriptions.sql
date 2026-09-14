-- ============================================================
-- push_subscriptions: suscripciones de notificaciones push web (Web Push
-- API + VAPID) por usuario y organización. Cada dispositivo/navegador en
-- el que un miembro del negocio activa las notificaciones guarda acá su
-- endpoint + claves de cifrado; el compute service (con la API key admin)
-- las lee para mandar el push cuando se confirma una reserva nueva.
-- ============================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,

  endpoint text not null,
  p256dh text not null,
  auth text not null,

  created_at timestamptz not null default now(),

  constraint uq_push_subscriptions_endpoint unique (endpoint)
);

create index if not exists idx_push_subscriptions_org on public.push_subscriptions (organization_id);

alter table public.push_subscriptions enable row level security;

-- Un miembro sólo puede crear/ver/borrar SU PROPIA suscripción (user_id =
-- auth.uid()), y sólo para una organización de la que realmente es
-- miembro (evita que alguien registre un endpoint propio contra el
-- organization_id de un negocio ajeno para recibir sus notificaciones).
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.push_subscriptions to authenticated;

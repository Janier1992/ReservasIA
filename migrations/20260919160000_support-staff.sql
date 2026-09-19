-- ============================================================
-- Panel de soporte multi-tenant: agrega un rol "support_staff" que puede
-- leer (no escribir, salvo dos excepciones puntuales) los datos de TODOS
-- los negocios, para que el equipo de Synflow AI pueda diagnosticar
-- problemas sin pedir capturas de pantalla.
--
-- Estas policies se SUMAN a las que ya existen (RLS combina policies con
-- OR), así que no debilitan el aislamiento entre negocios: un dueño normal
-- sigue viendo solo lo suyo, is_support_staff() solo abre una puerta
-- adicional para quien tiene fila activa en support_staff.
-- ============================================================

create table if not exists public.support_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'support' check (role in ('support', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.support_staff enable row level security;

-- Solo puede leer su propia fila (para que la UI decida si le muestra el
-- link "Soporte" en el menú). Sin policies de insert/update/delete para
-- `authenticated`: sumar o sacar gente del equipo de soporte se hace a
-- mano por SQL/CLI, nunca desde la app.
drop policy if exists "support_staff_select_self" on public.support_staff;
create policy "support_staff_select_self"
  on public.support_staff for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.support_staff to authenticated;

create or replace function public.is_support_staff()
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.support_staff
    where user_id = (select auth.uid())
      and active
  );
$$;

grant execute on function public.is_support_staff() to authenticated;

-- ------------------------------------------------------------
-- Lectura cross-tenant para soporte.
-- ------------------------------------------------------------
drop policy if exists "organizations_select_support" on public.organizations;
create policy "organizations_select_support"
  on public.organizations for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "business_profiles_select_support" on public.business_profiles;
create policy "business_profiles_select_support"
  on public.business_profiles for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "agents_select_support" on public.agents;
create policy "agents_select_support"
  on public.agents for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "integrations_select_support" on public.integrations;
create policy "integrations_select_support"
  on public.integrations for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "reservations_select_support" on public.reservations;
create policy "reservations_select_support"
  on public.reservations for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "conversations_select_support" on public.conversations;
create policy "conversations_select_support"
  on public.conversations for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "messages_select_support" on public.messages;
create policy "messages_select_support"
  on public.messages for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "customers_select_support" on public.customers;
create policy "customers_select_support"
  on public.customers for select
  to authenticated
  using (public.is_support_staff());

-- ------------------------------------------------------------
-- Acción básica #1: pausar/reactivar el agente de cualquier negocio.
-- ------------------------------------------------------------
drop policy if exists "agents_update_support" on public.agents;
create policy "agents_update_support"
  on public.agents for update
  to authenticated
  using (public.is_support_staff())
  with check (public.is_support_staff());

-- ------------------------------------------------------------
-- Acción básica #2: notas internas de soporte por negocio. El negocio
-- nunca tiene policy de acceso a esta tabla: no la ve ni sabe que existe.
-- ------------------------------------------------------------
create table if not exists public.support_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.support_notes enable row level security;

drop policy if exists "support_notes_select_support" on public.support_notes;
create policy "support_notes_select_support"
  on public.support_notes for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "support_notes_insert_support" on public.support_notes;
create policy "support_notes_insert_support"
  on public.support_notes for insert
  to authenticated
  with check (public.is_support_staff() and author_user_id = (select auth.uid()));

grant select, insert on public.support_notes to authenticated;

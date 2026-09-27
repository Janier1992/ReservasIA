-- ============================================================
-- Fase 4: encuestas de satisfacción y recuperación de clientes.
--
-- Encuestas (módulo `surveys`):
--   survey_requests   una encuesta por atención completada, con un token
--                     secreto. El cliente la responde en la página pública
--                     /o/<token> (sin cuenta) vía las RPC get_public_survey
--                     y submit_public_survey, habilitadas para anon. Si
--                     califica 4 o 5 y el negocio cargó su enlace de reseñas
--                     (business_profiles.review_url), se le invita a dejar
--                     la reseña en Google.
--   Se puede pedir a mano desde el panel (WhatsApp, chat o copiar enlace) y,
--   con el compute service corriendo, se manda sola unas horas después de
--   la atención (business_profiles.survey_auto_send).
--
-- Recuperación (módulo `reactivation`):
--   get_reactivation_candidates  clientes cuya última atención completada fue
--                                hace más de business_profiles.reactivation_days
--                                días, sin reservas futuras y sin contacto
--                                reciente.
--   reactivation_contacts        registro de a quién se le escribió.
--
-- Ambos módulos arrancan APAGADOS: soporte los activa por negocio.
-- ============================================================

-- ------------------------------------------------------------
-- Módulos
-- ------------------------------------------------------------
alter table public.organizations
  drop constraint if exists organizations_disabled_modules_known;
alter table public.organizations
  add constraint organizations_disabled_modules_known
  check (disabled_modules <@ array[
    'inbox', 'customers', 'services', 'resources', 'agent', 'integrations', 'team',
    'walk_ins', 'reports', 'public_booking', 'assets', 'workflow', 'plans', 'cash',
    'surveys', 'reactivation'
  ]::text[]);

alter table public.organizations
  alter column disabled_modules set default
  array['walk_ins', 'reports', 'public_booking', 'plans', 'cash', 'surveys', 'reactivation']::text[];

do $$
declare
  k text;
begin
  foreach k in array array['surveys', 'reactivation'] loop
    if not exists (select 1 from public.module_defaults_applied where module_key = k) then
      update public.organizations
        set disabled_modules = array_append(disabled_modules, k)
        where not (k = any (disabled_modules));
      insert into public.module_defaults_applied (module_key) values (k);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Ajustes del negocio
-- ------------------------------------------------------------
alter table public.business_profiles
  add column if not exists review_url text,
  add column if not exists survey_auto_send boolean not null default true,
  add column if not exists reactivation_days integer not null default 45;

alter table public.business_profiles
  drop constraint if exists business_profiles_review_url_check;
alter table public.business_profiles
  add constraint business_profiles_review_url_check
  check (review_url is null or (review_url ~ '^https://' and length(review_url) <= 500));

alter table public.business_profiles
  drop constraint if exists business_profiles_reactivation_days_check;
alter table public.business_profiles
  add constraint business_profiles_reactivation_days_check check (reactivation_days between 7 and 365);

-- ------------------------------------------------------------
-- Encuestas
-- ------------------------------------------------------------
create table if not exists public.survey_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  -- 64 caracteres hex (dos UUID v4 al azar): imposible de adivinar.
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  sent_via text,
  sent_at timestamptz,
  rating smallint,
  comment text,
  answered_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint survey_requests_rating_check check (rating is null or rating between 1 and 5),
  constraint survey_requests_comment_check check (comment is null or length(comment) <= 1000),
  constraint survey_requests_sent_via_check check (sent_via is null or sent_via in ('whatsapp_link', 'chat', 'copy', 'auto_telegram', 'auto_whatsapp'))
);

create unique index if not exists uq_survey_requests_reservation on public.survey_requests (reservation_id) where reservation_id is not null;
create index if not exists idx_survey_requests_org on public.survey_requests (organization_id, created_at desc);

create or replace function public.check_survey_request_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.reservation_id is not null and not exists (
    select 1 from public.reservations where id = new.reservation_id and organization_id = new.organization_id
  ) then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if new.customer_id is not null and not exists (
    select 1 from public.customers where id = new.customer_id and organization_id = new.organization_id
  ) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_survey_request_tenant on public.survey_requests;
create trigger trg_check_survey_request_tenant
  before insert on public.survey_requests
  for each row execute function public.check_survey_request_tenant();

alter table public.survey_requests enable row level security;

drop policy if exists "survey_requests_select_member" on public.survey_requests;
create policy "survey_requests_select_member" on public.survey_requests for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "survey_requests_insert_member" on public.survey_requests;
create policy "survey_requests_insert_member" on public.survey_requests for insert to authenticated
  with check (public.is_org_member(organization_id) and rating is null and answered_at is null);
drop policy if exists "survey_requests_delete_admin" on public.survey_requests;
create policy "survey_requests_delete_admin" on public.survey_requests for delete to authenticated
  using (public.is_org_admin_or_owner(organization_id));
drop policy if exists "survey_requests_select_support" on public.survey_requests;
create policy "survey_requests_select_support" on public.survey_requests for select to authenticated
  using (public.is_support_staff());

-- El equipo solo puede marcar por dónde la envió; la respuesta la escribe
-- únicamente el cliente, vía submit_public_survey.
grant select, insert, delete on public.survey_requests to authenticated;
grant update (sent_via, sent_at) on public.survey_requests to authenticated;
drop policy if exists "survey_requests_update_member" on public.survey_requests;
create policy "survey_requests_update_member" on public.survey_requests for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Datos mínimos para mostrar la encuesta: nada del cliente salvo su nombre.
create or replace function public.get_public_survey(p_token text)
returns table (
  business_name text,
  logo_url text,
  business_type text,
  customer_first_name text,
  service_name text,
  visited_at timestamptz,
  answered boolean,
  rating smallint,
  review_url text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    coalesce(bp.name, o.name),
    bp.logo_url,
    o.business_type,
    nullif(split_part(trim(coalesce(r.customer_name, c.name, '')), ' ', 1), ''),
    s.name,
    r.start_at,
    sr.answered_at is not null,
    sr.rating,
    case when sr.rating >= 4 then bp.review_url end
  from public.survey_requests sr
  join public.organizations o on o.id = sr.organization_id
  left join public.business_profiles bp on bp.organization_id = sr.organization_id
  left join public.reservations r on r.id = sr.reservation_id
  left join public.customers c on c.id = sr.customer_id
  left join public.services s on s.id = r.service_id
  where sr.token = p_token
    and length(p_token) = 64
    and o.status = 'active'
    and sr.created_at > now() - interval '60 days';
$$;

create or replace function public.submit_public_survey(p_token text, p_rating integer, p_comment text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_request public.survey_requests;
  v_review_url text;
begin
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'SURVEY_INVALID_RATING' using errcode = 'P0001';
  end if;

  select sr.* into v_request
    from public.survey_requests sr
    join public.organizations o on o.id = sr.organization_id
    where sr.token = p_token
      and length(p_token) = 64
      and o.status = 'active'
      and sr.created_at > now() - interval '60 days'
    for update of sr;

  if not found then
    raise exception 'SURVEY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_request.answered_at is not null then
    raise exception 'SURVEY_ALREADY_ANSWERED' using errcode = 'P0001';
  end if;

  update public.survey_requests
    set rating = p_rating,
        comment = nullif(left(trim(coalesce(p_comment, '')), 1000), ''),
        answered_at = now()
    where id = v_request.id;

  if p_rating >= 4 then
    select review_url into v_review_url from public.business_profiles where organization_id = v_request.organization_id;
  end if;
  return v_review_url;
end;
$$;

revoke all on function public.get_public_survey(text) from public;
revoke all on function public.submit_public_survey(text, integer, text) from public;
grant execute on function public.get_public_survey(text) to anon, authenticated;
grant execute on function public.submit_public_survey(text, integer, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Recuperación de clientes
-- ------------------------------------------------------------
create table if not exists public.reactivation_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null,
  contacted_by uuid default auth.uid(),
  contacted_at timestamptz not null default now(),
  constraint reactivation_contacts_channel_check check (channel in ('whatsapp_link', 'chat', 'dismissed'))
);

create index if not exists idx_reactivation_contacts_customer on public.reactivation_contacts (organization_id, customer_id, contacted_at desc);

create or replace function public.check_reactivation_contact_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and organization_id = new.organization_id) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_reactivation_contact_tenant on public.reactivation_contacts;
create trigger trg_check_reactivation_contact_tenant
  before insert on public.reactivation_contacts
  for each row execute function public.check_reactivation_contact_tenant();

alter table public.reactivation_contacts enable row level security;

drop policy if exists "reactivation_contacts_select_member" on public.reactivation_contacts;
create policy "reactivation_contacts_select_member" on public.reactivation_contacts for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "reactivation_contacts_insert_member" on public.reactivation_contacts;
create policy "reactivation_contacts_insert_member" on public.reactivation_contacts for insert to authenticated
  with check (public.is_org_member(organization_id) and contacted_by = (select auth.uid()));
drop policy if exists "reactivation_contacts_select_support" on public.reactivation_contacts;
create policy "reactivation_contacts_select_support" on public.reactivation_contacts for select to authenticated
  using (public.is_support_staff());

grant select, insert on public.reactivation_contacts to authenticated;

-- Clientes para recuperar. security definer para poder agregar sobre toda la
-- historia, pero solo responde a miembros del negocio.
create or replace function public.get_reactivation_candidates(p_organization_id uuid)
returns table (
  customer_id uuid,
  name text,
  phone text,
  conversation_id uuid,
  last_visit_at timestamptz,
  visits bigint,
  last_service_name text,
  last_contacted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_days integer;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(reactivation_days, 45) into v_days from public.business_profiles where organization_id = p_organization_id;
  v_days := coalesce(v_days, 45);

  return query
  with done as (
    select r.customer_id, r.start_at, r.service_id, r.conversation_id,
           row_number() over (partition by r.customer_id order by r.start_at desc) as rn,
           count(*) over (partition by r.customer_id) as n
    from public.reservations r
    where r.organization_id = p_organization_id
      and r.status = 'completed'
      and r.customer_id is not null
  )
  select c.id, c.name, c.phone,
         coalesce(d.conversation_id, (
           select cv.id from public.conversations cv
           where cv.organization_id = p_organization_id and cv.customer_id = c.id
           order by cv.updated_at desc limit 1
         )),
         d.start_at, d.n, s.name,
         (select max(rc.contacted_at) from public.reactivation_contacts rc
           where rc.organization_id = p_organization_id and rc.customer_id = c.id)
  from done d
  join public.customers c on c.id = d.customer_id and c.organization_id = p_organization_id
  left join public.services s on s.id = d.service_id
  where d.rn = 1
    and d.start_at < now() - make_interval(days => v_days)
    and not exists (
      select 1 from public.reservations f
      where f.organization_id = p_organization_id
        and f.customer_id = c.id
        and f.status in ('pending', 'confirmed')
        and f.start_at > now()
    )
    and not exists (
      select 1 from public.reactivation_contacts rc
      where rc.organization_id = p_organization_id
        and rc.customer_id = c.id
        and rc.contacted_at > now() - make_interval(days => v_days)
    )
  order by d.n desc, d.start_at desc
  limit 200;
end;
$$;

revoke all on function public.get_reactivation_candidates(uuid) from public;
grant execute on function public.get_reactivation_candidates(uuid) to authenticated;

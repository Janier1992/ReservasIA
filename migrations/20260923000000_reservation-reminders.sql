-- ============================================================
-- Recordatorio automático de reservas: el compute service revisa
-- periódicamente qué reservas confirmadas están por empezar y todavía no
-- recibieron su recordatorio, y le escribe al cliente por el mismo canal
-- (Telegram/WhatsApp) que usó para reservar — sin que el cliente tenga que
-- escribir primero.
--
-- reminder_hours_before = 0 desactiva los recordatorios para ese negocio
-- (default 3: recordatorio 3 horas antes, ajustable desde Configuración).
-- reservations.reminder_sent_at marca que ya se envió, para no duplicar.
-- ============================================================

alter table public.business_profiles
  add column if not exists reminder_hours_before integer not null default 3;

-- Postgres no soporta "ADD CONSTRAINT IF NOT EXISTS" para CHECK constraints
-- (ver la migración de payment-deposits para el mismo problema ya vivido).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_profiles_reminder_hours_check') then
    alter table public.business_profiles
      add constraint business_profiles_reminder_hours_check check (reminder_hours_before >= 0);
  end if;
end $$;

alter table public.reservations
  add column if not exists reminder_sent_at timestamptz;

create index if not exists idx_reservations_reminder_pending
  on public.reservations (start_at)
  where status = 'confirmed' and reminder_sent_at is null;

-- ------------------------------------------------------------
-- get_due_reservation_reminders(): SOLO para el compute service (clave
-- admin) — nunca se otorga a `authenticated` porque cruza datos de todas
-- las organizaciones. No hace falta bypass de RLS explícito: la clave
-- admin ya bypassa RLS y grants por diseño de InsForge.
-- ------------------------------------------------------------
create or replace function public.get_due_reservation_reminders()
returns table (
  reservation_id uuid,
  organization_id uuid,
  customer_id uuid,
  customer_phone text,
  customer_name text,
  service_name text,
  start_at timestamptz,
  timezone text,
  business_name text
)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select
    r.id,
    r.organization_id,
    r.customer_id,
    c.phone,
    coalesce(r.customer_name, c.name),
    s.name,
    r.start_at,
    o.timezone,
    bp.name
  from public.reservations r
  join public.organizations o on o.id = r.organization_id
  join public.business_profiles bp on bp.organization_id = r.organization_id
  left join public.customers c on c.id = r.customer_id
  left join public.services s on s.id = r.service_id
  where r.status = 'confirmed'
    and r.reminder_sent_at is null
    and o.status = 'active'
    and bp.reminder_hours_before > 0
    and c.phone is not null
    and r.start_at > now()
    and r.start_at <= now() + (bp.reminder_hours_before || ' hours')::interval
$$;

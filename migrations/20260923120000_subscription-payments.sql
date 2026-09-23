-- ============================================================
-- Suscripción de la plataforma (no confundir con los anticipos de Nequi
-- que el AGENTE cobra a los CLIENTES del negocio — esto es lo que el
-- NEGOCIO le paga a Synflow AI por usar Reservas AI). Primera versión,
-- manual: el negocio transfiere por Nequi, sube el comprobante desde el
-- dashboard, y un admin de soporte lo revisa y confirma desde /soporte.
-- Mientras no exista un cobro recurrente automático (Stripe/Razorpay ya
-- están disponibles en InsForge para una fase futura), esto reemplaza a
-- "recordarle a mano a alguien que cobre y suspenda".
-- ============================================================

alter table public.organizations
  add column if not exists subscription_expires_at timestamptz;

-- NULL = sin fecha de vencimiento todavía (todos los negocios existentes
-- antes de esta migración quedan así a propósito: no hay que suspender por
-- sorpresa a nadie que ya estaba activo). El scheduler de vencimiento
-- (server/) nunca toca una fila con este campo en NULL.

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  receipt_storage_path text not null,
  amount numeric,
  note text,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint subscription_payments_status_check check (status in ('pending', 'confirmed', 'rejected')),
  constraint subscription_payments_amount_check check (amount is null or amount >= 0)
);

create index if not exists idx_subscription_payments_org on public.subscription_payments (organization_id, created_at desc);

alter table public.subscription_payments enable row level security;

-- El negocio ve y reporta sus propios pagos; nunca puede marcarlos como
-- confirmados/rechazados (eso solo lo hace soporte, más abajo).
drop policy if exists "subscription_payments_select_member" on public.subscription_payments;
create policy "subscription_payments_select_member"
  on public.subscription_payments for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "subscription_payments_insert_admin" on public.subscription_payments;
create policy "subscription_payments_insert_admin"
  on public.subscription_payments for insert
  to authenticated
  with check (public.is_org_admin_or_owner(organization_id) and submitted_by = (select auth.uid()));

drop policy if exists "subscription_payments_select_support" on public.subscription_payments;
create policy "subscription_payments_select_support"
  on public.subscription_payments for select
  to authenticated
  using (public.is_support_staff());

drop policy if exists "subscription_payments_update_support" on public.subscription_payments;
create policy "subscription_payments_update_support"
  on public.subscription_payments for update
  to authenticated
  using (public.is_support_staff())
  with check (public.is_support_staff());

grant select, insert, update on public.subscription_payments to authenticated;

-- Soporte solo puede tocar status/reviewed_by/reviewed_at al revisar un
-- pago — nunca el organization_id, el comprobante o el monto reportado
-- (mismo criterio que restrict_support_agent_update /
-- restrict_support_org_update: RLS filtra filas, esto filtra columnas).
create or replace function public.restrict_support_subscription_payment_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.submitted_by is distinct from old.submitted_by
    or new.receipt_storage_path is distinct from old.receipt_storage_path
    or new.amount is distinct from old.amount
    or new.note is distinct from old.note
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Solo se pueden modificar status, reviewed_by y reviewed_at de un pago reportado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_support_subscription_payment_update on public.subscription_payments;
create trigger trg_restrict_support_subscription_payment_update
  before update on public.subscription_payments
  for each row execute function public.restrict_support_subscription_payment_update();

-- ------------------------------------------------------------
-- Amplía la restricción de columnas ya existente para que soporte (o el
-- compute service con la clave admin, para el auto-suspendido por
-- vencimiento) también pueda tocar subscription_expires_at además de
-- status — sin esto, confirmar un pago no podría extender el vencimiento.
-- ------------------------------------------------------------
create or replace function public.restrict_support_org_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if public.is_org_admin_or_owner(new.id) then
    return new;
  end if;

  if new.name is distinct from old.name
    or new.slug is distinct from old.slug
    or new.business_type is distinct from old.business_type
    or new.timezone is distinct from old.timezone
  then
    raise exception 'support_staff solo puede modificar status y subscription_expires_at de organizations';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- Bucket privado para los comprobantes de pago de la suscripción. Solo
-- admin/owner de la organización puede subir el suyo (mismo patrón de
-- storage key "<org_id>/..." que business-logos); sin policy de SELECT
-- para authenticated/anon: se lee únicamente vía signed URL generada por
-- una Edge Function con la clave admin (igual que payment-receipts).
-- ------------------------------------------------------------
drop policy if exists "subscription_receipts_owner_insert" on storage.objects;
create policy "subscription_receipts_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket = 'subscription-receipts' and public.is_org_admin_or_owner_for_storage_key(key));

-- ============================================================
-- Anticipos de pago (Nequi): el negocio configura un número de Nequi y una
-- política de anticipo (obligatorio u opcional, % del precio del servicio).
-- El agente pide el anticipo antes de confirmar la reserva cuando aplica;
-- la confirmación de que el pago realmente llegó la hace una persona del
-- negocio desde el panel, revisando el comprobante que el cliente manda por
-- el chat (ver migración de mensajes de imagen más abajo) — el agente nunca
-- confirma un pago por su cuenta.
-- ============================================================

alter table public.business_profiles
  add column if not exists nequi_phone text,
  add column if not exists deposit_enabled boolean not null default false,
  add column if not exists deposit_mandatory boolean not null default false,
  add column if not exists deposit_percentage numeric;

alter table public.business_profiles
  add constraint business_profiles_deposit_percentage_check
  check (deposit_percentage is null or (deposit_percentage > 0 and deposit_percentage <= 100));

-- payment_status vive en la propia reserva (no en una tabla aparte) porque
-- es 1:1 con la reserva y de bajo volumen de estados; separarlo en otra
-- tabla no aportaría nada y complicaría los joins del dashboard.
alter table public.reservations
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists deposit_amount numeric;

alter table public.reservations
  add constraint reservations_payment_status_check
  check (payment_status in ('not_required', 'awaiting_payment', 'awaiting_confirmation', 'paid'));

alter table public.reservations
  add constraint reservations_deposit_amount_check
  check (deposit_amount is null or deposit_amount >= 0);

create index if not exists idx_reservations_payment_status
  on public.reservations (organization_id, payment_status)
  where payment_status <> 'not_required';

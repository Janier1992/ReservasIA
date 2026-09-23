-- ============================================================
-- Anticipos de pago (Nequi): el negocio configura un número de Nequi y una
-- política de anticipo (obligatorio u opcional, % del precio del servicio).
-- El agente pide el anticipo antes de confirmar la reserva cuando aplica;
-- la confirmación de que el pago realmente llegó la hace una persona del
-- negocio desde el panel, revisando el comprobante que el cliente manda por
-- el chat (ver migración de mensajes de imagen más abajo) — el agente nunca
-- confirma un pago por su cuenta.
--
-- NOTA: este archivo se escribió originalmente como
-- 20260918090000_payment-deposits.sql y en algún momento su SQL se aplicó
-- directo contra la base (todas las columnas/constraints ya existían),
-- pero sin quedar registrado en el historial de migraciones de InsForge.
-- Eso bloqueaba "migrations up" para cualquier migración posterior ("no se
-- puede aplicar una migración más vieja que la última ya aplicada"). Se
-- renombra con timestamp más nuevo (y se vuelven idempotentes sus
-- constraints) para poder re-ejecutarlo sin romper nada y liberar la cola.
-- ============================================================

alter table public.business_profiles
  add column if not exists nequi_phone text,
  add column if not exists deposit_enabled boolean not null default false,
  add column if not exists deposit_mandatory boolean not null default false,
  add column if not exists deposit_percentage numeric;

-- Postgres no soporta "ADD CONSTRAINT IF NOT EXISTS" para CHECK constraints;
-- se guarda a mano contra pg_constraint para que este archivo se pueda
-- volver a correr sin romper si ya se había aplicado (pasó una vez: la
-- migración quedó aplicada en la base pero no registrada en el historial
-- de InsForge, bloqueando "migrations up" hasta volver a correrla).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_profiles_deposit_percentage_check') then
    alter table public.business_profiles
      add constraint business_profiles_deposit_percentage_check
      check (deposit_percentage is null or (deposit_percentage > 0 and deposit_percentage <= 100));
  end if;
end $$;

-- payment_status vive en la propia reserva (no en una tabla aparte) porque
-- es 1:1 con la reserva y de bajo volumen de estados; separarlo en otra
-- tabla no aportaría nada y complicaría los joins del dashboard.
alter table public.reservations
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists deposit_amount numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_payment_status_check') then
    alter table public.reservations
      add constraint reservations_payment_status_check
      check (payment_status in ('not_required', 'awaiting_payment', 'awaiting_confirmation', 'paid'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_deposit_amount_check') then
    alter table public.reservations
      add constraint reservations_deposit_amount_check
      check (deposit_amount is null or deposit_amount >= 0);
  end if;
end $$;

create index if not exists idx_reservations_payment_status
  on public.reservations (organization_id, payment_status)
  where payment_status <> 'not_required';

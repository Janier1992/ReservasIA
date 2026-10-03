-- ============================================================
-- Aviso por Telegram o WhatsApp para reservas hechas en la página pública,
-- en todos los rubros (antes solo existía para los pedidos por QR).
--
-- Al reservar, la reserva recibe un notify_code. La página ofrece "Avisame
-- por Telegram" (t.me/<bot>?start=<código>) o "por WhatsApp"
-- (wa.me/<número>?text=Reserva #<código>); ese primer mensaje del cliente
-- vincula su chat con la reserva (notify_channel / notify_identity). El
-- server le confirma la cita por ese chat y el recordatorio de antes de la
-- cita sale por ahí. Mismo formato de código que walk_ins.notify_code.
-- ============================================================

alter table public.reservations
  add column if not exists notify_code text,
  add column if not exists notify_channel text,
  add column if not exists notify_identity text;

alter table public.reservations drop constraint if exists reservations_notify_code_check;
alter table public.reservations
  add constraint reservations_notify_code_check check (notify_code is null or notify_code ~ '^[A-Z0-9]{10}$');
alter table public.reservations drop constraint if exists reservations_notify_channel_check;
alter table public.reservations
  add constraint reservations_notify_channel_check check (notify_channel is null or notify_channel in ('telegram', 'whatsapp'));

create unique index if not exists uq_reservations_notify_code on public.reservations (notify_code) where notify_code is not null;

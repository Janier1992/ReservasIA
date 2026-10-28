-- ============================================================
-- Correo y Google Calendar también para lo que se hace desde el panel.
--
-- El chat y la página pública crean y cancelan reservas a través del
-- server, que manda el correo al cliente y actualiza Google Calendar. El
-- panel lo hace directo en la base (book_reservation / cancel_reservation)
-- y el server no se enteraba. Ahora el server revisa cada pocos segundos
-- las reservas que todavía no pasaron por ese paso:
--
--   created_sync_at    cuándo se mandó la confirmación (correo + Calendar)
--   cancelled_sync_at  cuándo se avisó la cancelación (correo + Calendar)
--
-- null = pendiente. El server toma cada una con un update condicional
-- (... where created_sync_at is null), así nunca sale dos veces.
-- ============================================================

alter table public.reservations
  add column if not exists created_sync_at timestamptz,
  add column if not exists cancelled_sync_at timestamptz;

-- Lo que ya existía no se vuelve a avisar. Las llegadas sin reserva
-- (source = 'walk_in') nunca mandan correo: el cliente está en el local.
update public.reservations
  set created_sync_at = created_at
  where created_sync_at is null and source <> 'walk_in';

update public.reservations
  set cancelled_sync_at = updated_at
  where cancelled_sync_at is null and status = 'cancelled';

-- La tarea del server busca por estas columnas cada pocos segundos.
create index if not exists reservations_pending_created_sync_idx
  on public.reservations (created_at)
  where created_sync_at is null;

create index if not exists reservations_pending_cancelled_sync_idx
  on public.reservations (updated_at)
  where cancelled_sync_at is null and status = 'cancelled';

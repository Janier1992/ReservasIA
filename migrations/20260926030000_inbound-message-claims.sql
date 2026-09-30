-- ============================================================
-- Deduplicación de mensajes entrantes entre procesos.
--
-- Incidente 2026-09-25: una segunda instancia del compute service (fuera de
-- Railway, con las credenciales de producción) leía los mismos bots de
-- Telegram. Telegram le entrega un update a cualquier consumidor que pida
-- getUpdates antes de que se confirme el offset, así que ambos procesos
-- recibían el mismo mensaje: se guardaba dos veces y corrían dos turnos del
-- agente en paralelo (respuestas dobles, una reserva "no disponible" y otra
-- "confirmada" para el mismo pedido, e historial intercalado que dejó la
-- conversación inutilizable para el modelo durante ~50 minutos).
--
-- El lock por conversación de agentRuntime solo protege dentro de UN
-- proceso. Esta tabla es el "claim" atómico compartido: el primer proceso
-- que inserta la clave del mensaje lo procesa; cualquier otro recibe
-- conflicto y lo descarta. Se usa una tabla nueva en vez de un índice único
-- sobre messages para no tener que borrar los duplicados históricos.
-- ============================================================

create table if not exists public.inbound_message_claims (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null,
  external_conversation_id text not null,
  external_message_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (organization_id, channel, external_conversation_id, external_message_id)
);

create index if not exists idx_inbound_message_claims_claimed_at
  on public.inbound_message_claims (claimed_at);

-- Solo la usa el compute service con la clave admin; sin grants ni
-- policies para authenticated (RLS habilitado = denegado por defecto).
alter table public.inbound_message_claims enable row level security;

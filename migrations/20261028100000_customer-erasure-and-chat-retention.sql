-- ============================================================
-- Datos personales de los clientes (Ley 1581 de 2012).
--
-- 1. erase_customer: "Eliminar cliente" borra de verdad sus datos. Antes
--    solo se borraba la fila de customers; sus chats (con su número o
--    usuario y todo lo que escribió) y el nombre y las notas en sus
--    reservas y llegadas quedaban guardados. Ahora:
--      - se borran sus conversaciones y mensajes;
--      - sus reservas y llegadas se conservan para la agenda, las ventas y
--        los reportes del negocio, pero sin nombre, teléfono, notas ni chat;
--      - se borra el cliente (y con él sus vehículos/mascotas, planes y
--        paquetes, que ya caían en cascada).
--
-- 2. purge_old_chat_history: los chats no se guardan para siempre. El
--    server la llama una vez al día y borra los mensajes de más de un año
--    y las conversaciones que quedan vacías.
-- ============================================================

create or replace function public.erase_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Los mismos que ya podían borrar clientes (policy customers_delete_admin).
  if not public.is_backend_caller() and not public.is_org_admin_or_owner(v_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.conversations
    where organization_id = v_organization_id and customer_id = p_customer_id;

  update public.reservations
    set customer_name = null,
        special_requests = null,
        internal_notes = null,
        notify_channel = null,
        notify_identity = null
    where organization_id = v_organization_id and customer_id = p_customer_id;

  update public.walk_ins
    set customer_name = 'Cliente eliminado',
        customer_phone = null,
        notes = null,
        notify_channel = null,
        notify_identity = null
    where organization_id = v_organization_id and customer_id = p_customer_id;

  delete from public.customers where id = p_customer_id;
end;
$$;

revoke all on function public.erase_customer(uuid) from public;
grant execute on function public.erase_customer(uuid) to authenticated;

create or replace function public.purge_old_chat_history(p_retention_days integer default 365)
returns table (deleted_messages bigint, deleted_conversations bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_cutoff timestamptz;
  v_messages bigint;
  v_conversations bigint;
begin
  if not public.is_backend_caller() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_retention_days is null or p_retention_days < 30 then
    raise exception 'INVALID_RETENTION' using errcode = '22023';
  end if;
  v_cutoff := now() - make_interval(days => p_retention_days);

  delete from public.messages where created_at < v_cutoff;
  get diagnostics v_messages = row_count;

  delete from public.conversations c
    where c.created_at < v_cutoff
      and not exists (select 1 from public.messages m where m.conversation_id = c.id);
  get diagnostics v_conversations = row_count;

  return query select v_messages, v_conversations;
end;
$$;

revoke all on function public.purge_old_chat_history(integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'project_admin') then
    grant execute on function public.purge_old_chat_history(integer) to project_admin;
    grant execute on function public.erase_customer(uuid) to project_admin;
  end if;
end;
$$;

create index if not exists idx_messages_created_at on public.messages (created_at);

-- ============================================================
-- Borrado de datos de un cliente (erase_customer) y retención de chats
-- (purge_old_chat_history). Usuarios: ...0001 dueño de A, ...0002 dueño
-- de B, ...0003 staff de A. Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Barbería A', 'barberia-a-erase', 'barbershop', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Barbería B', 'barberia-b-erase', 'barbershop', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'staff'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.customers (id, organization_id, name, phone, email) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana Gómez', '3001', 'ana@test.local'),
  ('55555555-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Luis', '3002', null);
insert into public.conversations (id, organization_id, customer_id, channel, external_conversation_id) values
  ('77777777-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'telegram', '111'),
  ('77777777-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 'telegram', '222');
insert into public.messages (organization_id, conversation_id, role, content) values
  ('11111111-aaaa-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 'user', 'Hola, soy Ana, mi cédula es 123'),
  ('11111111-aaaa-0000-0000-000000000001', '77777777-0000-0000-0000-000000000002', 'user', 'Hola, soy Luis');
insert into public.reservations (id, organization_id, customer_id, conversation_id, start_at, end_at, source, status,
                                 customer_name, special_requests, internal_notes, notify_channel, notify_identity) values
  ('66666666-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
   '77777777-0000-0000-0000-000000000001', now() - interval '10 days', now() - interval '10 days' + interval '1 hour',
   'telegram', 'completed', 'Ana Gómez', 'Alergia a la lidocaína', 'Paga en efectivo', 'telegram', 'telegram:111');
insert into public.walk_ins (organization_id, customer_id, customer_name, customer_phone, notes) values
  ('11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'Ana Gómez', '3001', 'Viene con el hijo');

set local role authenticated;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  perform public.erase_customer('55555555-0000-0000-0000-000000000001');
  raise exception 'FAIL: el dueño de otro negocio borró un cliente ajeno';
exception when insufficient_privilege then
  raise notice 'OK: nadie de otro negocio puede borrar al cliente';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  perform public.erase_customer('55555555-0000-0000-0000-000000000001');
  raise exception 'FAIL: el staff borró un cliente';
exception when insufficient_privilege then
  raise notice 'OK: el staff no puede borrar clientes (igual que antes)';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.erase_customer('55555555-0000-0000-0000-000000000001');

set local role postgres;
do $$
declare
  r public.reservations;
  w public.walk_ins;
begin
  if exists (select 1 from public.customers where id = '55555555-0000-0000-0000-000000000001') then
    raise exception 'FAIL: el cliente sigue existiendo';
  end if;
  if exists (select 1 from public.conversations where id = '77777777-0000-0000-0000-000000000001')
     or exists (select 1 from public.messages where conversation_id = '77777777-0000-0000-0000-000000000001') then
    raise exception 'FAIL: quedaron sus chats';
  end if;
  select * into r from public.reservations where id = '66666666-0000-0000-0000-000000000001';
  if r.id is null then
    raise exception 'FAIL: se borró la reserva (el negocio la necesita para su historial)';
  end if;
  if r.customer_name is not null or r.special_requests is not null or r.internal_notes is not null
     or r.notify_identity is not null or r.customer_id is not null or r.conversation_id is not null then
    raise exception 'FAIL: la reserva conserva datos del cliente';
  end if;
  select * into w from public.walk_ins where organization_id = '11111111-aaaa-0000-0000-000000000001' limit 1;
  if w.customer_name <> 'Cliente eliminado' or w.customer_phone is not null or w.notes is not null then
    raise exception 'FAIL: la llegada conserva datos del cliente';
  end if;
  if not exists (select 1 from public.messages where conversation_id = '77777777-0000-0000-0000-000000000002') then
    raise exception 'FAIL: se borraron chats de otro cliente';
  end if;
  raise notice 'OK: borrar un cliente borra sus chats y sus datos en reservas y llegadas, sin tocar a los demás';
end $$;

-- Retención: un mensaje de hace dos años se borra; el de hoy se queda.
insert into public.conversations (id, organization_id, channel, external_conversation_id, created_at) values
  ('77777777-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', 'telegram', '333', now() - interval '2 years');
insert into public.messages (organization_id, conversation_id, role, content, created_at) values
  ('11111111-aaaa-0000-0000-000000000001', '77777777-0000-0000-0000-000000000003', 'user', 'mensaje viejo', now() - interval '2 years');

do $$
declare
  v_messages bigint;
  v_conversations bigint;
begin
  select deleted_messages, deleted_conversations into v_messages, v_conversations from public.purge_old_chat_history(365);
  if v_messages <> 1 or v_conversations <> 1 then
    raise exception 'FAIL: se esperaba borrar 1 mensaje y 1 conversación, se borraron % y %', v_messages, v_conversations;
  end if;
  if not exists (select 1 from public.messages where conversation_id = '77777777-0000-0000-0000-000000000002') then
    raise exception 'FAIL: se borró un mensaje reciente';
  end if;
  begin
    perform public.purge_old_chat_history(1);
    raise exception 'FAIL: aceptó una retención de 1 día';
  exception when invalid_parameter_value then null; end;
  raise notice 'OK: los chats de más de un año se borran; los recientes se quedan';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform public.purge_old_chat_history(365);
  raise exception 'FAIL: un usuario del panel pudo purgar chats';
exception when insufficient_privilege then
  raise notice 'OK: solo el server purga chats';
end $$;

rollback;

-- ============================================================
-- Tablero en tiempo real: los cambios de walk_ins y reservations publican
-- un aviso (sin datos del cliente) en "walk_ins:<org>"; solo los miembros
-- del negocio se pueden suscribir; si el aviso falla, el pedido igual entra.
-- Usuarios: ...0003 staff de A. Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Antojitos A', 'antojitos-a-realtime', 'restaurant', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Otro B', 'otro-b-realtime', 'restaurant', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'staff');

-- El staff registra una llegada desde el panel (sin permiso propio para publicar).
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
insert into public.walk_ins (organization_id, customer_name)
  values ('11111111-aaaa-0000-0000-000000000001', 'Ana Gil');

set local role postgres;
do $$ declare m record; begin
  select channel_name, event_name, payload into m from realtime.messages order by created_at desc limit 1;
  if m.channel_name is distinct from 'walk_ins:11111111-aaaa-0000-0000-000000000001' or m.event_name <> 'board_changed' then
    raise exception 'FAIL: no se publicó el aviso del tablero (%)', m;
  end if;
  if m.payload::text like '%Ana%' then raise exception 'FAIL: el aviso lleva datos del cliente'; end if;
  raise notice 'OK: una llegada avisa al canal del negocio, sin datos del cliente';
end $$;

-- Si realtime falla, el pedido igual se guarda.
alter function realtime.publish(text, text, jsonb) rename to publish_off;
insert into public.walk_ins (organization_id, customer_name)
  values ('11111111-aaaa-0000-0000-000000000001', 'Sin realtime');
alter function realtime.publish_off(text, text, jsonb) rename to publish;
do $$ begin
  if not exists (select 1 from public.walk_ins where customer_name = 'Sin realtime') then
    raise exception 'FAIL: un fallo de realtime bloqueó el pedido';
  end if;
  raise notice 'OK: un fallo del aviso nunca bloquea un pedido';
end $$;

-- Suscripción: solo al canal de un negocio del que se es miembro.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare own int; other int; junk int; begin
  perform set_config('realtime.channel_name', 'walk_ins:11111111-aaaa-0000-0000-000000000001', true);
  select count(*) into own from realtime.channels where pattern = 'walk_ins:%';
  perform set_config('realtime.channel_name', 'walk_ins:22222222-bbbb-0000-0000-000000000002', true);
  select count(*) into other from realtime.channels where pattern = 'walk_ins:%';
  perform set_config('realtime.channel_name', 'walk_ins:no-es-uuid', true);
  select count(*) into junk from realtime.channels where pattern = 'walk_ins:%';
  if own <> 1 then raise exception 'FAIL: el staff no puede suscribirse a su negocio'; end if;
  if other <> 0 then raise exception 'FAIL: se puede suscribir al tablero de otro negocio'; end if;
  if junk <> 0 then raise exception 'FAIL: canal con nombre inválido aceptado'; end if;
  raise notice 'OK: solo los miembros se suscriben al tablero de su negocio';
end $$;

rollback;

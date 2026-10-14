-- ============================================================
-- Tablero en tiempo real: cada cambio en walk_ins o reservations avisa al
-- canal "walk_ins:<organization_id>" de InsForge Realtime, y el tablero de
-- Atención en sitio se refresca al instante (sin esperar la consulta
-- periódica, que queda como respaldo).
--
-- El aviso no lleva datos del cliente: solo qué tabla cambió. El tablero
-- vuelve a leer con sus permisos (RLS) de siempre.
--
-- Si el esquema realtime no existe (ej. Postgres de CI), no se crea el canal
-- y el trigger no hace nada: un fallo del aviso NUNCA bloquea un pedido.
-- ============================================================

create or replace function public.notify_board_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
  else
    v_org := new.organization_id;
  end if;
  begin
    perform realtime.publish('walk_ins:' || v_org::text, 'board_changed', jsonb_build_object('table', tg_table_name, 'op', tg_op));
  exception when others then
    -- Sin realtime (o canal apagado): el tablero igual se entera por la consulta periódica.
    null;
  end;
  return null;
end;
$$;

revoke all on function public.notify_board_change() from public;

drop trigger if exists trg_walk_ins_board_change on public.walk_ins;
create trigger trg_walk_ins_board_change
  after insert or update or delete on public.walk_ins
  for each row execute function public.notify_board_change();

drop trigger if exists trg_reservations_board_change on public.reservations;
create trigger trg_reservations_board_change
  after insert or update or delete on public.reservations
  for each row execute function public.notify_board_change();

do $$
begin
  if to_regclass('realtime.channels') is null then
    raise notice 'Sin esquema realtime: el tablero usa solo la consulta periódica.';
    return;
  end if;

  execute $sql$
    insert into realtime.channels (pattern, description, enabled)
    values ('walk_ins:%', 'Tablero de Atención en sitio: avisa cambios de walk_ins y reservations por negocio', true)
    on conflict (pattern) do update set enabled = true, description = excluded.description
  $sql$;

  -- Solo los miembros del negocio pueden suscribirse a su canal.
  execute 'alter table realtime.channels enable row level security';
  execute 'drop policy if exists "walk_ins_board_subscribe_member" on realtime.channels';
  execute $sql$
    create policy "walk_ins_board_subscribe_member" on realtime.channels
      for select to authenticated
      using (
        pattern = 'walk_ins:%'
        -- CASE: el cast a uuid solo se evalúa si el nombre tiene el formato esperado.
        and case
          when realtime.channel_name() ~ '^walk_ins:[0-9a-fA-F-]{36}$'
            then public.is_org_member(substr(realtime.channel_name(), 10)::uuid)
          else false
        end
      )
  $sql$;
end $$;

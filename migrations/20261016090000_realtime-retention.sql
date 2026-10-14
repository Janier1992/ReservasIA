-- ============================================================
-- Retención de los avisos de tiempo real: cada cambio en walk_ins y
-- reservations deja una fila en realtime.messages (ver
-- 20261015090000_board-realtime.sql). InsForge los guarda para siempre por
-- defecto; el tablero solo los necesita al instante, así que se conservan 7
-- días (InsForge los borra cada noche con realtime.cleanup_messages()).
-- Si alguien ya configuró otra retención, se respeta.
--
-- En InsForge Cloud realtime.config es de la plataforma y project_admin no
-- la puede modificar: en ese caso no se cambia nada (aviso, no error) y la
-- retención se configura desde el panel de InsForge (Realtime).
-- ============================================================
do $$
begin
  if to_regclass('realtime.config') is null then
    return;
  end if;
  execute 'update realtime.config set retention_days = 7 where retention_days is null';
exception when insufficient_privilege then
  raise notice 'Sin permiso sobre realtime.config: configurá la retención de mensajes desde el panel de InsForge.';
end $$;

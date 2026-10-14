-- ============================================================
-- Retención de los avisos de tiempo real: cada cambio en walk_ins y
-- reservations deja una fila en realtime.messages (ver
-- 20261015090000_board-realtime.sql). InsForge los guarda para siempre por
-- defecto; el tablero solo los necesita al instante, así que se conservan 7
-- días (InsForge los borra cada noche con realtime.cleanup_messages()).
-- Si alguien ya configuró otra retención, se respeta.
-- ============================================================
do $$
begin
  if to_regclass('realtime.config') is null then
    return;
  end if;
  execute 'update realtime.config set retention_days = 7 where retention_days is null';
end $$;

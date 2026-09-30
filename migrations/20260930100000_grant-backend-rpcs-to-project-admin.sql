-- ============================================================
-- El compute service (Railway) llama estas cuatro funciones con la clave
-- admin, que corre como el rol project_admin:
--   book_reservation         el agente crea reservas
--   cancel_reservation       el agente cancela
--   reschedule_reservation   el agente reprograma
--   get_due_reservation_reminders  recordatorios automáticos
--
-- 20260930092000, 20260930093000 y 20260930094000 les quitaron el EXECUTE
-- de PUBLIC y se lo dieron solo a authenticated. Si project_admin no es
-- dueño de las funciones ni superusuario, dependía justamente de PUBLIC y
-- quedó sin acceso: el agente dejaría de reservar/cancelar/reprogramar y
-- los recordatorios dejarían de salir. Se le otorga explícitamente.
-- Idempotente e inocuo si project_admin ya tenía acceso; si el rol no
-- existe (Postgres local de tests sin él), no hace nada.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'project_admin') then
    grant execute on function public.book_reservation(
      uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, uuid
    ) to project_admin;
    grant execute on function public.cancel_reservation(uuid) to project_admin;
    grant execute on function public.reschedule_reservation(uuid, timestamptz, timestamptz) to project_admin;
    grant execute on function public.get_due_reservation_reminders() to project_admin;
  end if;
end;
$$;

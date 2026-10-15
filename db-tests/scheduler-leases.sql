-- ============================================================
-- Turnos de tareas programadas: una sola instancia ejecuta cada vuelta;
-- el turno se renueva para quien lo tiene y pasa a otra al vencer; la app
-- no puede pedirlos. Transacción revertida.
-- ============================================================
\set QUIET on
begin;
set local role postgres;
do $$ declare a boolean; b boolean; a2 boolean; c boolean; begin
  a := public.acquire_scheduler_lease('reminders', 'instancia-a', 600);
  b := public.acquire_scheduler_lease('reminders', 'instancia-b', 600);
  a2 := public.acquire_scheduler_lease('reminders', 'instancia-a', 600);
  if not a or b or not a2 then raise exception 'FAIL: turno (a=% b=% a2=%)', a, b, a2; end if;
  update public.scheduler_leases set expires_at = now() - interval '1 second' where job = 'reminders';
  c := public.acquire_scheduler_lease('reminders', 'instancia-b', 600);
  if not c then raise exception 'FAIL: el turno vencido no pasó a otra instancia'; end if;
  if not public.acquire_scheduler_lease('surveys', 'instancia-a', 600) then raise exception 'FAIL: tareas distintas se bloquean entre sí'; end if;
  raise notice 'OK: una instancia por vuelta; el turno vence y pasa a otra';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  begin
    perform public.acquire_scheduler_lease('reminders', 'intruso', 600);
    raise exception 'FAIL: un usuario de la app tomó un turno';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: solo el server toma turnos';
end $$;

rollback;

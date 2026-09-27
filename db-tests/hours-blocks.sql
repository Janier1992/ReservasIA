-- ============================================================
-- Tests de horario por recurso y bloqueos de agenda. Todo en una
-- transacción que se revierte. Usuarios: ...0001 (dueño de A),
-- ...0002 (dueño de B), ...0003 (staff de A).
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Barbería A', 'barberia-a', 'barbershop', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Barbería B', 'barberia-b', 'barbershop', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'staff'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.resources (id, organization_id, name) values
  ('88888888-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Juan'),
  ('88888888-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Pedro'),
  ('88888888-0000-0000-0000-000000000003', '22222222-bbbb-0000-0000-000000000002', 'Otro');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare r public.reservations; begin
  insert into public.resource_hour_periods (organization_id, resource_id, day_of_week, opening_time, closing_time)
    values ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 1, '09:00', '13:00');
  raise notice 'OK: el dueño define el horario de un recurso';

  begin
    insert into public.resource_hour_periods (organization_id, resource_id, day_of_week, opening_time, closing_time)
      values ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 1, '09:00', '13:00');
    raise exception 'FAIL: horario con recurso de otro negocio';
  exception when others then if sqlerrm not like '%RESOURCE_NOT_FOUND%' then raise; end if; end;
  raise notice 'OK: no se define horario a un recurso de otro negocio';

  -- Vacaciones de Juan mañana todo el día.
  insert into public.schedule_blocks (id, organization_id, resource_id, starts_at, ends_at, reason)
    values ('99999999-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001',
            date_trunc('day', now()) + interval '1 day', date_trunc('day', now()) + interval '2 days', 'Vacaciones');

  begin
    perform public.book_reservation('11111111-aaaa-0000-0000-000000000001', null, null, '88888888-0000-0000-0000-000000000001', null,
      date_trunc('day', now()) + interval '1 day 15 hours', date_trunc('day', now()) + interval '1 day 16 hours', null, 'Ana', null, 'dashboard');
    raise exception 'FAIL: reservó sobre un bloqueo del recurso';
  exception when others then if sqlerrm not like '%TIME_BLOCKED%' then raise; end if; end;
  raise notice 'OK: no se reserva un recurso bloqueado';

  r := public.book_reservation('11111111-aaaa-0000-0000-000000000001', null, null, '88888888-0000-0000-0000-000000000002', null,
      date_trunc('day', now()) + interval '1 day 15 hours', date_trunc('day', now()) + interval '1 day 16 hours', null, 'Ana', null, 'dashboard');
  raise notice 'OK: el otro recurso sí se puede reservar ese día';

  -- Cierre de todo el negocio pasado mañana.
  insert into public.schedule_blocks (organization_id, starts_at, ends_at, reason)
    values ('11111111-aaaa-0000-0000-000000000001', date_trunc('day', now()) + interval '2 days', date_trunc('day', now()) + interval '3 days', 'Festivo');
  begin
    update public.reservations set start_at = start_at + interval '1 day', end_at = end_at + interval '1 day' where id = r.id;
    raise exception 'FAIL: movió una reserva a un día cerrado';
  exception when others then if sqlerrm not like '%TIME_BLOCKED%' then raise; end if; end;
  raise notice 'OK: no se mueve una reserva a un bloqueo de todo el negocio';

  update public.reservations set status = 'completed' where id = r.id;
  raise notice 'OK: cambiar el estado de una reserva existente no choca con bloqueos';

  begin
    insert into public.schedule_blocks (organization_id, starts_at, ends_at)
      values ('11111111-aaaa-0000-0000-000000000001', now() + interval '2 hours', now() + interval '1 hour');
    raise exception 'FAIL: bloqueo con fin antes del inicio';
  exception when check_violation then null; end;
  raise notice 'OK: bloqueo con rango inválido rechazado';
end $$;

-- Staff: crea y borra su propio bloqueo, pero no el del dueño ni el horario.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare n int; begin
  insert into public.schedule_blocks (id, organization_id, resource_id, starts_at, ends_at, reason)
    values ('99999999-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000002',
            now() + interval '5 days', now() + interval '5 days 1 hour', 'Almuerzo');
  delete from public.schedule_blocks where id = '99999999-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: el staff no pudo borrar su propio bloqueo'; end if;
  delete from public.schedule_blocks where id = '99999999-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: el staff borró el bloqueo del dueño'; end if;
  begin
    insert into public.resource_hour_periods (organization_id, resource_id, day_of_week, opening_time, closing_time)
      values ('11111111-aaaa-0000-0000-000000000001', '88888888-0000-0000-0000-000000000002', 2, '09:00', '12:00');
    raise exception 'FAIL: el staff cambió el horario de un recurso';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: el staff maneja sus bloqueos pero no los del dueño ni los horarios';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  select count(*) into n from public.schedule_blocks where organization_id = '11111111-aaaa-0000-0000-000000000001';
  if n <> 0 then raise exception 'FAIL: B ve bloqueos de A'; end if;
  select count(*) into n from public.resource_hour_periods where organization_id = '11111111-aaaa-0000-0000-000000000001';
  if n <> 0 then raise exception 'FAIL: B ve horarios de A'; end if;
  begin
    insert into public.schedule_blocks (organization_id, starts_at, ends_at)
      values ('11111111-aaaa-0000-0000-000000000001', now(), now() + interval '1 hour');
    raise exception 'FAIL: B bloqueó la agenda de A';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: el dueño de B no ve ni bloquea la agenda de A';
end $$;
rollback;

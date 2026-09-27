-- ============================================================
-- Tests de encuestas y recuperación de clientes. Todo en una transacción
-- que se revierte. Usuarios: ...0001 (dueño de A), ...0002 (dueño de B).
-- ============================================================
\set QUIET on
begin;
set local role postgres;
insert into public.organizations (id, name, slug, business_type, timezone) values
  ('11111111-aaaa-0000-0000-000000000001', 'Barbería A', 'barberia-a', 'barbershop', 'America/Bogota'),
  ('22222222-bbbb-0000-0000-000000000002', 'Barbería B', 'barberia-b', 'barbershop', 'America/Bogota');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-aaaa-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('22222222-bbbb-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');
insert into public.business_profiles (organization_id, name, timezone, review_url, reactivation_days) values
  ('11111111-aaaa-0000-0000-000000000001', 'Barbería A', 'America/Bogota', 'https://g.page/r/barberia-a/review', 30);
insert into public.customers (id, organization_id, name, phone) values
  ('55555555-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Ana Gómez', '3001'),
  ('55555555-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', 'Luis', '3002'),
  ('55555555-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', 'Marta', '3003'),
  ('55555555-0000-0000-0000-000000000009', '22222222-bbbb-0000-0000-000000000002', 'Beto', '3009');
-- Ana: vino hace 60 días (candidata). Luis: vino hace 60 días pero tiene turno futuro. Marta: vino hace 5 días.
insert into public.reservations (id, organization_id, customer_id, start_at, end_at, source, status) values
  ('66666666-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
   now() - interval '60 days', now() - interval '60 days' + interval '1 hour', 'dashboard', 'completed'),
  ('66666666-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002',
   now() - interval '60 days', now() - interval '60 days' + interval '1 hour', 'dashboard', 'completed'),
  ('66666666-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002',
   now() + interval '3 days', now() + interval '3 days 1 hour', 'dashboard', 'confirmed'),
  ('66666666-0000-0000-0000-000000000004', '11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000003',
   now() - interval '5 days', now() - interval '5 days' + interval '1 hour', 'dashboard', 'completed');

do $$ declare m text[]; begin
  select disabled_modules into m from public.organizations where id = '11111111-aaaa-0000-0000-000000000001';
  if not (m @> array['surveys', 'reactivation']) then raise exception 'FAIL: encuestas/recuperación no arrancan apagados'; end if;
  raise notice 'OK: encuestas y recuperación arrancan apagados';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
create temp table t_token (token text) on commit drop;
grant all on t_token to authenticated, anon;
do $$ declare v_token text; begin
  insert into public.survey_requests (organization_id, reservation_id, customer_id)
    values ('11111111-aaaa-0000-0000-000000000001', '66666666-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000003')
    returning token into v_token;
  if length(v_token) <> 64 then raise exception 'FAIL: token de largo %', length(v_token); end if;
  insert into t_token values (v_token);
  raise notice 'OK: el dueño crea la encuesta con un token de 64 caracteres';

  begin
    insert into public.survey_requests (organization_id, reservation_id, rating)
      values ('11111111-aaaa-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 5);
    raise exception 'FAIL: el negocio se autocalificó';
  exception when insufficient_privilege then null; end;
  begin
    update public.survey_requests set rating = 5 where token = v_token;
    raise exception 'FAIL: el negocio editó la calificación';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: el negocio no puede escribir calificaciones';

  begin
    insert into public.survey_requests (organization_id, reservation_id)
      values ('11111111-aaaa-0000-0000-000000000001', '66666666-0000-0000-0000-000000000004');
    raise exception 'FAIL: dos encuestas para la misma atención';
  exception when unique_violation then null; end;
  raise notice 'OK: una sola encuesta por atención';
end $$;

-- El cliente (sin sesión) responde.
set local role anon;
reset request.jwt.claim.sub;
do $$ declare v_token text; r record; v_url text; begin
  select token into v_token from t_token;
  select * into r from public.get_public_survey(v_token);
  if r.business_name <> 'Barbería A' or r.customer_first_name <> 'Marta' or r.answered then
    raise exception 'FAIL: datos de la encuesta pública: %', r;
  end if;
  raise notice 'OK: la encuesta pública muestra negocio y nombre, sin sesión';

  if (select count(*) from public.get_public_survey(repeat('0', 64))) <> 0 then raise exception 'FAIL: token inventado devolvió datos'; end if;
  raise notice 'OK: un token inventado no devuelve nada';

  v_url := public.submit_public_survey(v_token, 5, '  Excelente corte  ');
  if v_url is distinct from 'https://g.page/r/barberia-a/review' then raise exception 'FAIL: no devolvió el enlace de reseña (%)', v_url; end if;
  raise notice 'OK: con 5 estrellas invita a dejar la reseña en Google';

  begin
    perform public.submit_public_survey(v_token, 1, 'cambio de opinión');
    raise exception 'FAIL: respondió dos veces';
  exception when others then if sqlerrm not like '%SURVEY_ALREADY_ANSWERED%' then raise; end if; end;
  raise notice 'OK: una encuesta solo se responde una vez';

  begin
    perform count(*) from public.survey_requests;
    raise exception 'FAIL: anon leyó la tabla de encuestas';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: anon no lee la tabla de encuestas';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare r record; n int; begin
  select rating, comment into r from public.survey_requests where reservation_id = '66666666-0000-0000-0000-000000000004';
  if r.rating <> 5 or r.comment <> 'Excelente corte' then raise exception 'FAIL: respuesta guardada: %', r; end if;
  raise notice 'OK: el dueño ve la calificación y el comentario';

  select count(*) into n from public.get_reactivation_candidates('11111111-aaaa-0000-0000-000000000001');
  if n <> 1 or not exists (select 1 from public.get_reactivation_candidates('11111111-aaaa-0000-0000-000000000001') where name = 'Ana Gómez') then
    raise exception 'FAIL: candidatos a recuperar = %', n;
  end if;
  raise notice 'OK: recuperar lista solo a quien no vuelve hace rato y no tiene turno';

  insert into public.reactivation_contacts (organization_id, customer_id, channel)
    values ('11111111-aaaa-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'whatsapp_link');
  select count(*) into n from public.get_reactivation_candidates('11111111-aaaa-0000-0000-000000000001');
  if n <> 0 then raise exception 'FAIL: sigue listando a un cliente recién contactado'; end if;
  raise notice 'OK: un cliente contactado sale de la lista';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  begin
    perform * from public.get_reactivation_candidates('11111111-aaaa-0000-0000-000000000001');
    raise exception 'FAIL: B consultó los clientes a recuperar de A';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.survey_requests;
  if n <> 0 then raise exception 'FAIL: B ve encuestas de A'; end if;
  begin
    insert into public.reactivation_contacts (organization_id, customer_id, channel)
      values ('22222222-bbbb-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001', 'chat');
    raise exception 'FAIL: B registró contacto con cliente de A';
  exception when others then if sqlerrm not like '%CUSTOMER_NOT_FOUND%' then raise; end if; end;
  raise notice 'OK: el dueño de B no ve ni toca encuestas ni clientes de A';
end $$;
rollback;

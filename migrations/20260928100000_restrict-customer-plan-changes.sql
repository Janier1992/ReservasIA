-- ============================================================
-- Planes de clientes: qué puede cambiar el equipo desde la app.
--
-- 1. customer_plans tenía UPDATE abierto a cualquier miembro sobre todas las
--    columnas: un empleado podía devolver sesiones usadas, reactivar un bono
--    agotado o cancelar planes (el panel solo deja cancelar a owner/admin).
--    Ahora, fuera del server y del consumo automático:
--      - al vender, el plan arranca activo y sin usos;
--      - reward_ready -> redeemed (canjear premio): cualquier miembro;
--      - active -> cancelled: solo owner/admin;
--      - lo demás (usos, cantidades, vencimiento, cliente) no se edita.
--    El consumo automático corre dentro del trigger de reservations, así que
--    se reconoce por pg_trigger_depth() > 1.
-- 2. El vencimiento se comparaba con la fecha UTC: en Colombia un plan que
--    vence hoy dejaba de contar desde las 7 p. m. Ahora se usa la fecha del
--    negocio (organizations.timezone).
-- ============================================================

create or replace function public.restrict_customer_plan_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 or public.is_backend_caller() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.sessions_used <> 0 or new.status <> 'active' then
      raise exception 'PLAN_INVALID_INITIAL_STATE' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.organization_id, new.customer_id, new.plan_id, new.name, new.kind, new.sessions_total,
      new.sessions_used, new.service_ids, new.reward_text, new.starts_on, new.expires_on)
     is distinct from
     (old.organization_id, old.customer_id, old.plan_id, old.name, old.kind, old.sessions_total,
      old.sessions_used, old.service_ids, old.reward_text, old.starts_on, old.expires_on) then
    raise exception 'PLAN_NOT_EDITABLE' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'reward_ready' and new.status = 'redeemed' then
      null;
    elsif old.status = 'active' and new.status = 'cancelled' and public.is_org_admin_or_owner(old.organization_id) then
      null;
    else
      raise exception 'PLAN_STATUS_CHANGE_NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restrict_customer_plan_changes on public.customer_plans;
create trigger trg_restrict_customer_plan_changes
  before insert or update on public.customer_plans
  for each row execute function public.restrict_customer_plan_changes();

-- Igual que la versión anterior salvo v_today (fecha del negocio).
create or replace function public.apply_customer_plans_on_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_plan public.customer_plans;
  v_today date;
  v_inserted integer;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.customer_id is null then
    return new;
  end if;

  select (now() at time zone coalesce(o.timezone, 'UTC'))::date into v_today
    from public.organizations o where o.id = new.organization_id;
  v_today := coalesce(v_today, (now() at time zone 'utc')::date);

  -- Planes vencidos por fecha dejan de contar.
  update public.customer_plans
    set status = 'expired'
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and status = 'active'
      and expires_on is not null
      and expires_on < v_today;

  select * into v_plan
    from public.customer_plans
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and status = 'active'
      and kind = 'membership'
      and (cardinality(service_ids) = 0 or new.service_id = any (service_ids))
    order by expires_on nulls last
    limit 1;

  if not found then
    select * into v_plan
      from public.customer_plans
      where organization_id = new.organization_id
        and customer_id = new.customer_id
        and status = 'active'
        and kind = 'sessions'
        and (cardinality(service_ids) = 0 or new.service_id = any (service_ids))
      order by expires_on nulls last, created_at
      limit 1;
  end if;

  if found then
    insert into public.customer_plan_usages (organization_id, customer_plan_id, reservation_id)
      values (new.organization_id, v_plan.id, new.id)
      on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 and v_plan.kind = 'sessions' then
      update public.customer_plans
        set sessions_used = sessions_used + 1,
            status = case when sessions_used + 1 >= sessions_total then 'exhausted' else status end
        where id = v_plan.id;
    end if;
  end if;

  for v_plan in
    select * from public.customer_plans
      where organization_id = new.organization_id
        and customer_id = new.customer_id
        and status = 'active'
        and kind = 'stamps'
        and (cardinality(service_ids) = 0 or new.service_id = any (service_ids))
  loop
    insert into public.customer_plan_usages (organization_id, customer_plan_id, reservation_id)
      values (new.organization_id, v_plan.id, new.id)
      on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      update public.customer_plans
        set sessions_used = sessions_used + 1,
            status = case when sessions_used + 1 >= sessions_total then 'reward_ready' else status end
        where id = v_plan.id;
    end if;
  end loop;

  return new;
end;
$$;

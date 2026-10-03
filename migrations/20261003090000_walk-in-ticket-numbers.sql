-- ============================================================
-- Número de ticket en Atención en sitio.
--
-- Cada atención (llegada sin cita, reserva que llegó o pedido por QR) recibe
-- un número consecutivo por negocio que vuelve a 1 cada día, en la zona
-- horaria del negocio: #001, #002... Lo asigna un trigger al insertar, con un
-- lock por negocio y día para que dos registros simultáneos no repitan
-- número. Nadie lo puede escribir ni cambiar: el equipo no tiene permiso de
-- columna sobre ticket_number (ver 20260928110000) y el trigger ignora
-- cualquier valor que venga en el insert.
-- ============================================================

alter table public.walk_ins
  add column if not exists ticket_number integer;

alter table public.walk_ins drop constraint if exists walk_ins_ticket_number_check;
alter table public.walk_ins
  add constraint walk_ins_ticket_number_check check (ticket_number is null or ticket_number > 0);

create or replace function public.assign_walk_in_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_tz text;
  v_day date;
  v_from timestamptz;
  v_to timestamptz;
begin
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from public.organizations where id = new.organization_id;
  v_tz := coalesce(v_tz, 'UTC');
  new.arrived_at := coalesce(new.arrived_at, now());
  v_day := (new.arrived_at at time zone v_tz)::date;
  v_from := v_day::timestamp at time zone v_tz;
  v_to := (v_day + 1)::timestamp at time zone v_tz;

  perform pg_advisory_xact_lock(hashtextextended('walk_in_ticket:' || new.organization_id::text || ':' || v_day::text, 0));

  select coalesce(max(ticket_number), 0) + 1 into new.ticket_number
    from public.walk_ins
    where organization_id = new.organization_id
      and arrived_at >= v_from
      and arrived_at < v_to;
  return new;
end;
$$;

revoke all on function public.assign_walk_in_ticket() from public;

drop trigger if exists trg_walk_ins_ticket on public.walk_ins;
create trigger trg_walk_ins_ticket
  before insert on public.walk_ins
  for each row execute function public.assign_walk_in_ticket();

-- Las atenciones que ya existían reciben su número según el orden de llegada de cada día.
with numbered as (
  select w.id,
         row_number() over (
           partition by w.organization_id, (w.arrived_at at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date
           order by w.arrived_at, w.id
         ) as n
    from public.walk_ins w
    join public.organizations o on o.id = w.organization_id
   where w.ticket_number is null
)
update public.walk_ins w
   set ticket_number = numbered.n
  from numbered
 where w.id = numbered.id;

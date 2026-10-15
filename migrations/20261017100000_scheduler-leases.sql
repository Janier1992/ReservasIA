-- ============================================================
-- Tareas programadas con bloqueo: el server puede correr en varias
-- instancias (escalar en Railway) sin que los recordatorios, encuestas,
-- avisos de "listo" o vencimientos se ejecuten dos veces.
--
-- Cada vuelta de una tarea pide un "turno" (lease) por nombre: solo la
-- instancia que lo obtiene la ejecuta; las demás la saltan. El turno vence
-- solo (ttl), así que si la instancia que lo tenía se cae, otra lo toma en
-- la vuelta siguiente. Solo el server (clave admin) puede pedirlo.
-- ============================================================

create table if not exists public.scheduler_leases (
  job text primary key,
  holder text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.scheduler_leases enable row level security;
-- Sin políticas: nadie de la app lo lee ni escribe; solo la función de abajo.

create or replace function public.acquire_scheduler_lease(p_job text, p_holder text, p_ttl_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_got text;
begin
  if not public.is_backend_caller() then
    raise exception 'Solo el server puede tomar turnos de tareas programadas' using errcode = '42501';
  end if;
  if p_job is null or p_holder is null or p_ttl_seconds is null or p_ttl_seconds < 1 or p_ttl_seconds > 86400 then
    raise exception 'Turno inválido' using errcode = '22023';
  end if;

  insert into public.scheduler_leases as l (job, holder, expires_at, updated_at)
  values (p_job, p_holder, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (job) do update
    set holder = excluded.holder, expires_at = excluded.expires_at, updated_at = now()
    -- Se lo queda quien ya lo tenía (renueva) o cualquiera si ya venció.
    where l.holder = excluded.holder or l.expires_at <= now()
  returning l.holder into v_got;

  return v_got is not null;
end;
$$;

revoke all on function public.acquire_scheduler_lease(text, text, integer) from public;
grant execute on function public.acquire_scheduler_lease(text, text, integer) to authenticated;

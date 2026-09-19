-- ============================================================
-- Branding por negocio: nombre para mostrar (ya existe como
-- business_profiles.name) + logo. Este archivo agrega la columna
-- para la URL del logo y habilita el bucket "business-logos" para
-- que cada negocio pueda subir su propio logo de forma aislada.
--
-- IMPORTANTE: storage.objects hoy NO tiene RLS habilitado (ningún
-- bucket lo tiene, incluido "payment-receipts", que ya existía antes
-- de esta migración). Esta migración habilita RLS a nivel de TABLA
-- (afecta a todos los buckets), pero solo agrega policies para
-- "business-logos". Cualquier otro bucket (como "payment-receipts")
-- queda sin policies propias, es decir, denegado por defecto para
-- los roles anon/authenticated hasta que se le agreguen las suyas;
-- las claves admin (CLI/servidor) no se ven afectadas por RLS.
-- ============================================================

alter table public.business_profiles
  add column if not exists logo_url text;

-- ------------------------------------------------------------
-- Helper: valida que el primer segmento del key ("<org_id>/logo.ext")
-- sea un uuid y que el usuario actual sea admin/owner de esa
-- organización. Parseo seguro (no explota si el key no matchea el
-- formato esperado) para no filtrar errores 500 en vez de "denegado".
-- ------------------------------------------------------------
create or replace function public.is_org_admin_or_owner_for_storage_key(p_key text)
returns boolean
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_org_id uuid;
begin
  begin
    v_org_id := split_part(p_key, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.is_org_admin_or_owner(v_org_id);
end;
$$;

grant execute on function public.is_org_admin_or_owner_for_storage_key(text) to authenticated;

alter table storage.objects enable row level security;

-- drop + create (en vez de "create policy" a secas, como en el resto de las
-- migraciones del repo) porque este archivo se ejecuta manualmente desde la
-- consola SQL de InsForge además de vía CLI, y ese camino no lleva registro
-- de qué ya se aplicó. Con esto, volver a correrlo no rompe nada.
drop policy if exists "business_logos_public_read" on storage.objects;
create policy "business_logos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket = 'business-logos');

drop policy if exists "business_logos_admin_insert" on storage.objects;
create policy "business_logos_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket = 'business-logos' and public.is_org_admin_or_owner_for_storage_key(key));

drop policy if exists "business_logos_admin_update" on storage.objects;
create policy "business_logos_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket = 'business-logos' and public.is_org_admin_or_owner_for_storage_key(key))
  with check (bucket = 'business-logos' and public.is_org_admin_or_owner_for_storage_key(key));

drop policy if exists "business_logos_admin_delete" on storage.objects;
create policy "business_logos_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket = 'business-logos' and public.is_org_admin_or_owner_for_storage_key(key));

grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

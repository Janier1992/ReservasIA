-- ============================================================
-- search_customers: búsqueda por nombre O teléfono.
--
-- El SDK de InsForge no expone un filtro `.or()` (a diferencia de
-- PostgREST puro), así que la búsqueda combinada nombre/teléfono se
-- implementa acá como RPC.
-- ============================================================
create or replace function public.search_customers(p_organization_id uuid, p_query text)
returns setof public.customers
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select *
  from public.customers
  where organization_id = p_organization_id
    and ((select auth.uid()) is null or public.is_org_member(p_organization_id))
    and (
      p_query is null
      or p_query = ''
      or name ilike '%' || p_query || '%'
      or phone ilike '%' || p_query || '%'
    )
  order by created_at desc;
$$;

grant execute on function public.search_customers(uuid, text) to authenticated;

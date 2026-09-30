-- ============================================================
-- Auditoría de ACL (2026-09-30): varias funciones RPC de este proyecto
-- nunca tuvieron un `revoke ... from public` explícito desde que se
-- crearon. `grant execute ... to authenticated` en Postgres NO retira el
-- EXECUTE que PUBLIC recibe por defecto al crear una función — hace falta
-- un revoke aparte. Todas las funciones de abajo quedaban protegidas
-- ÚNICAMENTE por su lógica interna (is_backend_caller() / is_org_member() /
-- exigir auth.uid() no nulo), nunca por el permiso real. Se verificó una
-- por una que su lógica interna SÍ es correcta hoy (ninguna es explotable
-- ahora mismo) — esto es cerrar la segunda capa de defensa que faltaba,
-- no un parche de una fuga activa. Ninguna cambia de firma, así que no
-- hace falta DROP+CREATE (que fue justamente lo que causó la regresión de
-- book_reservation reconciliada en 20260930092000).
--
-- De paso quedó confirmado que search_customers, claim_demo_organization y
-- finish_walk_in no los llama ningún código del repo (código muerto — el
-- panel usa complete_walk_in, no finish_walk_in; la búsqueda de clientes
-- usa una query directa, no esta RPC). Se cierran igual por prolijidad,
-- sin borrarlas: no es el alcance de esta migración.
-- ============================================================

revoke all on function public.cancel_reservation(uuid) from public;
grant execute on function public.cancel_reservation(uuid) to authenticated;

revoke all on function public.reschedule_reservation(uuid, timestamptz, timestamptz) from public;
grant execute on function public.reschedule_reservation(uuid, timestamptz, timestamptz) to authenticated;

revoke all on function public.search_customers(uuid, text) from public;
grant execute on function public.search_customers(uuid, text) to authenticated;

revoke all on function public.accept_organization_invite(uuid) from public;
grant execute on function public.accept_organization_invite(uuid) to authenticated;

revoke all on function public.claim_demo_organization(uuid) from public;
grant execute on function public.claim_demo_organization(uuid) to authenticated;

revoke all on function public.create_organization_with_owner(text, text, text, text) from public;
grant execute on function public.create_organization_with_owner(text, text, text, text) to authenticated;

revoke all on function public.current_user_email() from public;
grant execute on function public.current_user_email() to authenticated;

revoke all on function public.finish_walk_in(uuid) from public;
grant execute on function public.finish_walk_in(uuid) to authenticated;

revoke all on function public.serve_walk_in(uuid, uuid) from public;
grant execute on function public.serve_walk_in(uuid, uuid) to authenticated;

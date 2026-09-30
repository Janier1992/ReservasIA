-- ============================================================
-- Mismo problema que 20260930093000: get_due_reservation_reminders() nunca
-- tuvo un `revoke ... from public` explícito. Su lógica interna ya es
-- correcta (`where public.is_backend_caller()`, agregado por
-- 20260927230000_close-anon-access-to-backend-rpcs.sql) — devuelve cero
-- filas para cualquier llamador que no sea el propio backend, sin importar
-- el permiso. No es explotable hoy; se cierra igual por la misma razón de
-- defensa en profundidad. En un archivo aparte porque 20260930093000 ya
-- quedó aplicado en producción antes de detectar este caso — nunca se
-- edita una migración ya aplicada, se agrega una nueva (ver el propio
-- historial de este proyecto: 20260922230000_payment-deposits.sql).
-- ============================================================

revoke all on function public.get_due_reservation_reminders() from public;
grant execute on function public.get_due_reservation_reminders() to authenticated;

-- ============================================================
-- Autorización de tratamiento de datos personales (Ley 1581 de 2012,
-- art. 9: la autorización debe poder probarse). La página pública de
-- reservas pide marcar una casilla antes de enviar nombre, celular y
-- correo; acá queda cuándo y por dónde la dio cada cliente:
--
--   customers.data_consent_at      cuándo autorizó (null = no consta)
--   customers.data_consent_source  por dónde: public_page (casilla de la
--                                  página de reservas)
--
-- Los datos de salud siguen teniendo su autorización aparte
-- (health_data_consent_at, 20260930101000).
-- ============================================================
alter table public.customers
  add column if not exists data_consent_at timestamptz,
  add column if not exists data_consent_source text;

alter table public.customers
  drop constraint if exists customers_data_consent_source_check;
alter table public.customers
  add constraint customers_data_consent_source_check
  check (data_consent_source is null or data_consent_source in ('public_page'));

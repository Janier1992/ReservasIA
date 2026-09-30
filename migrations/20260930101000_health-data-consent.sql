-- ============================================================
-- Autorización expresa para datos de salud (Ley 1581 de 2012, arts. 5-6):
-- el motivo de consulta de un paciente es un dato sensible y solo se puede
-- guardar con su autorización previa, expresa e informada. Un aviso no
-- basta.
--
-- customers.health_data_consent_at     cuándo autorizó (null = no autorizó
--                                      o la retiró)
-- customers.health_data_consent_source por dónde: chat (respondió SÍ al
--                                      aviso), public_page (marcó la casilla)
--                                      o panel (el equipo lo registró)
--
-- El código (agente y página pública) descarta el motivo de consulta de
-- quien no autorizó; el panel muestra el estado, permite registrarla o
-- retirarla y borrar los datos de salud guardados. Aplica a consultorios
-- odontológicos, clínicas y fisioterapia (datos de personas); la
-- veterinaria conserva solo el aviso.
-- ============================================================
alter table public.customers
  add column if not exists health_data_consent_at timestamptz,
  add column if not exists health_data_consent_source text;

alter table public.customers
  drop constraint if exists customers_health_consent_source_check;
alter table public.customers
  add constraint customers_health_consent_source_check
  check (health_data_consent_source is null or health_data_consent_source in ('chat', 'public_page', 'panel'));

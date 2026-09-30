-- ============================================================
-- Eslogan corto del negocio: aparece debajo del nombre en los correos de
-- reserva. La descripción no sirve para eso (es un texto largo pensado para
-- el agente IA).
-- ============================================================

alter table public.business_profiles
  add column if not exists tagline text;

alter table public.business_profiles drop constraint if exists business_profiles_tagline_check;
alter table public.business_profiles
  add constraint business_profiles_tagline_check check (tagline is null or length(tagline) <= 90);

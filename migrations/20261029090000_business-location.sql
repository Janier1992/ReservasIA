-- ============================================================
-- Ubicación exacta del negocio, para que el agente, la página de reservas
-- y el correo de confirmación le digan al cliente cómo llegar:
--
--   business_profiles.address_details  indicaciones para llegar (piso,
--                                      local, punto de referencia)
--   business_profiles.maps_url         enlace de Google Maps (o Waze) que
--                                      el negocio copia de "Compartir"
--
-- Sin enlace, se arma uno de búsqueda de Google Maps con la dirección
-- (ver server/src/utils/location.ts).
-- ============================================================
alter table public.business_profiles
  add column if not exists address_details text,
  add column if not exists maps_url text;

-- Solo enlaces https: el agente y el correo lo muestran tal cual.
alter table public.business_profiles
  drop constraint if exists business_profiles_maps_url_check;
alter table public.business_profiles
  add constraint business_profiles_maps_url_check
  check (maps_url is null or (maps_url ~ '^https://' and length(maps_url) <= 500));

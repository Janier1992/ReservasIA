-- ============================================================
-- Agotado del día: el equipo marca un producto como agotado y deja de
-- poder pedirse por QR hasta el día siguiente (en la zona horaria del
-- negocio), sin tener que desactivarlo y acordarse de volver a activarlo.
--
-- services.sold_out_on: fecha local del negocio en que se agotó. El producto
-- está agotado solo mientras esa fecha sea hoy; mañana vuelve solo.
-- null = disponible.
-- ============================================================

alter table public.services
  add column if not exists sold_out_on date;

-- ============================================================
-- Ajustes del tablero de Atención en sitio (por negocio, valen en todos los
-- dispositivos):
--   wait_alert_minutes: minutos de espera a partir de los cuales una
--     atención se marca "Demorada" y suena un aviso. null = sin alerta.
--   display_hide_prices: en modo pantalla (el televisor que ve el público)
--     no se muestran precios ni totales.
--   display_hide_names: en modo pantalla los nombres se abrevian
--     ("Andrea G.").
-- ============================================================

alter table public.business_profiles
  add column if not exists wait_alert_minutes smallint default 15,
  add column if not exists display_hide_prices boolean not null default false,
  add column if not exists display_hide_names boolean not null default false;

alter table public.business_profiles drop constraint if exists business_profiles_wait_alert_minutes_check;
alter table public.business_profiles
  add constraint business_profiles_wait_alert_minutes_check check (
    wait_alert_minutes is null or wait_alert_minutes between 1 and 240
  );

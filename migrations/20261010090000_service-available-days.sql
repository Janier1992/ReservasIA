-- ============================================================
-- Menú del día (restaurantes): días de la semana en que se ofrece cada
-- producto de la carta.
--
-- services.available_days: días en que el producto está en el menú, con la
-- numeración de JavaScript (0 = domingo ... 6 = sábado). null = todos los
-- días. La página de pedidos por QR muestra y acepta solo los productos del
-- día (en la zona horaria del negocio), y el panel permite ver solo el menú
-- de hoy. No afecta la disponibilidad de reservas de los demás rubros.
-- ============================================================

alter table public.services
  add column if not exists available_days smallint[];

alter table public.services drop constraint if exists services_available_days_check;
alter table public.services
  add constraint services_available_days_check check (
    available_days is null
    or (cardinality(available_days) between 1 and 7 and available_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
  );

-- ============================================================
-- Pedidos por QR con varios productos.
--
-- walk_ins.order_items guarda lo que pidió el cliente desde el QR, como foto
-- del momento del pedido (nombre y precio de cada producto), para que un
-- cambio posterior en la carta no altere un pedido ya hecho:
--   [{ "service_id": uuid, "name": text, "quantity": int,
--      "unit_price": numeric | null, "currency": text | null }]
-- Lo escribe solo el server (pedido público). El equipo no tiene INSERT ni
-- UPDATE sobre esta columna (sus permisos son por columna, ver
-- 20260928110000), así que nadie del panel puede alterar un pedido del cliente.
-- Con un solo producto, service_id sigue apuntando a ese producto; con varios
-- queda vacío y la fila muestra el detalle desde order_items.
-- ============================================================

alter table public.walk_ins
  add column if not exists order_items jsonb;

alter table public.walk_ins drop constraint if exists walk_ins_order_items_check;
alter table public.walk_ins
  add constraint walk_ins_order_items_check check (
    order_items is null
    or (jsonb_typeof(order_items) = 'array' and jsonb_array_length(order_items) between 1 and 20)
  );

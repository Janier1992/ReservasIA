# PRP: Pedidos por QR con aviso de "listo", acciones en Atención en sitio y Ventas

## Objetivo
1. **Pedido inmediato por QR** (rubro `restaurant` con Atención en sitio encendido): el cliente
   escanea, elige producto y deja su nombre; entra a la fila como "En espera". Puede pedir que
   le avisen por Telegram o WhatsApp. Cuando el equipo toca **Listo**, el bot del negocio le
   escribe que ya puede reclamarlo.
2. **Atención en sitio**: cada registro tiene acciones: editar (nombre, teléfono, producto,
   notas, personas), Listo (avisar), Atendido, Eliminar (owner/admin, con confirmación).
3. **Caja → Ventas**: registrar una venta eligiendo el producto (precio automático × cantidad)
   y medio de pago; listado de productos vendidos del día con totales. Al finalizar una atención
   se ofrece registrar la venta con un toque.

## Por qué deep links y no "detectar" el canal
Un bot de Telegram no puede escribirle a alguien que nunca le habló, y la web no puede saber si
el visitante tiene Telegram. WhatsApp (Meta) tampoco permite escribir primero sin plantilla
aprobada. La solución estándar: tras pedir, el cliente toca "Avisame por Telegram"
(`t.me/<bot>?start=<código>`) o "por WhatsApp" (`wa.me/<número>?text=Pedido <código>`). Ese
primer mensaje vincula su chat al pedido (y abre la ventana de 24 h de WhatsApp), así el aviso
de "listo" llega sin plantillas. Solo se muestran los canales que el negocio tiene conectados.

## Diseño
### Base de datos (migración `20260928110000_qr-orders-and-sales.sql`)
- `walk_ins`: `source` ('staff'|'qr'), `notify_code` (único), `notify_channel`,
  `notify_identity`, `ready_at`, `notified_at`, `notify_error`.
- `walk_ins`: UPDATE por columnas para `authenticated` (el equipo no puede escribir los campos
  de aviso; los escribe solo el server).
- RPC `delete_walk_in(id)`: solo owner/admin; si la llegada generó una reserva `walk_in` activa,
  la cancela (libera el recurso) y borra la llegada.
- `payments`: `service_id` (FK, mismo negocio), `quantity` (1–999).
### Server
- `publicBookingService`: `mode` = 'order' | 'booking' en el negocio público.
- `publicOrderService`: `createPublicOrder`, `linkOrderNotification`, `extractOrderCode`.
- Ruta `POST /api/public/businesses/:slug/orders` (límite por IP más amplio: wifi compartido).
- Telegram `/start <código>` y WhatsApp "Pedido <código>": vinculan y responden sin el agente.
- `orderReadyNotifier` (cada 10 s, con los demás workers): toma los pedidos listos sin avisar
  con un update condicional (una sola instancia avisa), envía, registra en el Inbox.
### App
- Página pública: vista de pedido cuando `mode === 'order'`; confirmación con posición y botones.
- Atención en sitio: diálogo de edición, Listo/avisado, Atendido, Eliminar; archivo partido en
  componentes (límite de 500 líneas).
- Ventas: `PaymentDialog` con producto y cantidad; `CashPage` como "Ventas" con productos vendidos.

## Validación
- Tests server: modo del negocio, creación de pedido, extracción/vinculación del código, notifier.
- Tests app: agregado de ventas por producto.
- `db-tests/qr-orders-sales.sql`: delete_walk_in (permisos + cancela reserva), columnas de aviso
  protegidas, venta con producto de otro negocio rechazada.
- lint, tipos, build, suites completas; migración en Postgres 16 local antes de producción.

## Fuera de alcance
- Pedidos con varios productos en un carrito (un producto + notas por ahora).
- Plantillas de WhatsApp para avisar a quien no escribió primero.

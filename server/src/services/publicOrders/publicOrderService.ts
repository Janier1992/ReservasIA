import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import { normalizePhone, publicPageMode, resolveOrganization } from "../publicBooking/publicBookingService.js";
import { generateOrderCode, loadNotifyLinks, type NotifyChannel } from "../chatLink/notifyLinks.js";
import { linkReservationByCode } from "../chatLink/reservationLink.js";

/**
 * Pedido inmediato desde el QR (/r/:slug en modo "order"): entra a la fila de
 * Atención en sitio y, si el cliente quiere, se le avisa cuando esté listo.
 *
 * Un bot no puede escribirle primero a alguien, ni la web sabe si el visitante
 * usa Telegram o WhatsApp. Por eso el pedido lleva un código: el cliente toca
 * "Avisame por Telegram" (t.me/<bot>?start=<código>) o "por WhatsApp"
 * (wa.me/<número>?text=Pedido #<código>) y ese primer mensaje vincula su chat
 * con el pedido. En WhatsApp además abre la ventana de 24 h de Meta, así que
 * el aviso de "listo" sale como texto libre, sin plantilla.
 */

export { extractOrderCode, generateOrderCode, type NotifyChannel } from "../chatLink/notifyLinks.js";

export interface PublicOrderItemInput {
  serviceId: string;
  quantity: number;
}

export interface PublicOrderInput {
  items: PublicOrderItemInput[];
  name: string;
  phone?: string;
  notes?: string;
}

/** Producto del pedido tal como estaba en la carta al momento de pedir (walk_ins.order_items). */
export interface OrderItem {
  service_id: string;
  name: string;
  quantity: number;
  unit_price: number | null;
  currency: string | null;
}

export interface PublicOrderResult {
  code: string;
  /** Número de ticket del día (#014); null si la base todavía no lo asigna. */
  ticketNumber: number | null;
  position: number;
  /** Resumen legible ("2× Hamburguesa y Limonada"). */
  serviceName: string;
  items: { name: string; quantity: number }[];
  /** Total del pedido; null si algún producto no tiene precio o hay monedas distintas. */
  total: number | null;
  currency: string | null;
  telegramUrl: string | null;
  whatsappUrl: string | null;
}

/** "#007": número de ticket del día en Atención en sitio. */
export function formatTicket(ticketNumber: number | null | undefined): string {
  return ticketNumber ? `#${String(ticketNumber).padStart(3, "0")}` : "";
}

export const MAX_ORDER_LINES = 20;
export const MAX_ITEM_QUANTITY = 20;

/** Junta líneas repetidas del mismo producto sumando cantidades. */
export function mergeOrderItems(items: PublicOrderItemInput[]): PublicOrderItemInput[] {
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.serviceId, (merged.get(item.serviceId) ?? 0) + item.quantity);
  return [...merged].map(([serviceId, quantity]) => ({ serviceId, quantity }));
}

/** "2× Hamburguesa, Papas y Limonada": así se lee el pedido en mensajes y en la fila. */
export function summarizeOrderItems(items: Pick<OrderItem, "name" | "quantity">[] | null | undefined): string {
  const parts = (items ?? []).map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name));
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

export function orderTotal(items: OrderItem[]): { total: number | null; currency: string | null } {
  const currencies = new Set(items.map((i) => i.currency ?? ""));
  if (items.some((i) => i.unit_price === null) || currencies.size !== 1) return { total: null, currency: null };
  return { total: items.reduce((sum, i) => sum + (i.unit_price ?? 0) * i.quantity, 0), currency: items[0].currency };
}

/** Valida que cada producto sea de este negocio y esté activo, y toma su nombre y precio actuales. */
async function loadOrderItems(organizationId: string, requested: PublicOrderItemInput[]): Promise<OrderItem[]> {
  const items = mergeOrderItems(requested);
  if (items.length === 0 || items.length > MAX_ORDER_LINES || items.some((i) => i.quantity < 1 || i.quantity > MAX_ITEM_QUANTITY)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Revisá las cantidades de tu pedido.", 400);
  }
  const { data } = await insforgeAdmin.database
    .from("services")
    .select("id, name, price, currency")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in(
      "id",
      items.map((i) => i.serviceId)
    );
  const found = new Map(((data ?? []) as { id: string; name: string; price: number | null; currency: string | null }[]).map((s) => [s.id, s]));
  if (items.some((i) => !found.has(i.serviceId))) {
    throw new AppError(ErrorCodes.SERVICE_NOT_FOUND, "Alguno de los productos ya no está disponible. Recargá la página y volvé a armar tu pedido.", 404);
  }
  return items.map((i) => {
    const s = found.get(i.serviceId)!;
    return { service_id: s.id, name: s.name, quantity: i.quantity, unit_price: s.price === null ? null : Number(s.price), currency: s.currency };
  });
}

export async function createPublicOrder(slug: string, input: PublicOrderInput): Promise<PublicOrderResult> {
  const org = await resolveOrganization(slug);
  if (publicPageMode(org.business_type, org.disabled_modules) !== "order") {
    throw new AppError(ErrorCodes.ORGANIZATION_NOT_FOUND, "Este negocio no recibe pedidos en línea.", 404);
  }
  const items = await loadOrderItems(org.id, input.items);
  const code = generateOrderCode();
  const phone = input.phone ? normalizePhone(input.phone) : "";

  const { data: created, error } = await insforgeAdmin.database
    .from("walk_ins")
    .insert([
      {
        organization_id: org.id,
        customer_name: input.name.trim(),
        customer_phone: phone || null,
        // Con un solo producto la fila y los reportes lo ven como el servicio de
        // la atención; con varios, el detalle está en order_items.
        service_id: items.length === 1 ? items[0].service_id : null,
        order_items: items,
        notes: input.notes?.trim() || null,
        source: "qr",
        notify_code: code
      }
    ])
    .select("id, arrived_at, ticket_number")
    .single();
  if (error || !created) {
    logger.error({ organizationId: org.id, err: error }, "public_order_insert_failed");
    throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo registrar el pedido. Intentá de nuevo.", 500);
  }
  const row = created as unknown as { id: string; arrived_at: string; ticket_number?: number | null };

  const { data: ahead } = await insforgeAdmin.database
    .from("walk_ins")
    .select("id")
    .eq("organization_id", org.id)
    .eq("status", "waiting")
    .lte("arrived_at", row.arrived_at);

  return {
    code,
    ticketNumber: row.ticket_number ?? null,
    position: Math.max(1, (ahead ?? []).length),
    serviceName: summarizeOrderItems(items),
    items: items.map((i) => ({ name: i.name, quantity: i.quantity })),
    ...orderTotal(items),
    ...(await loadNotifyLinks(org.id, code, "Pedido"))
  };
}

export interface OrderCodeMessage {
  organizationId: string;
  code: string;
  channel: NotifyChannel;
  identity: string;
  customerId: string;
  conversationId: string;
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * Vincula el chat que mandó el código con su pedido y devuelve la respuesta
 * (queda también en el Inbox). No pasa por el agente: es determinista.
 */
export async function handleOrderCodeMessage(msg: OrderCodeMessage): Promise<string> {
  const { data: order } = await insforgeAdmin.database
    .from("walk_ins")
    .select("id, customer_id, customer_name, status, ticket_number, order_items, services(name)")
    .eq("organization_id", msg.organizationId)
    .eq("notify_code", msg.code)
    .maybeSingle();
  const row = order as {
    id: string;
    customer_id: string | null;
    customer_name: string;
    status: string;
    ticket_number?: number | null;
    order_items: OrderItem[] | null;
    services: { name: string } | null;
  } | null;

  // El mismo código puede ser de una reserva de la página pública (todos los rubros).
  if (!row) {
    const reservationReply = await linkReservationByCode(msg);
    if (reservationReply) return reservationReply;
  }

  let reply: string;
  if (!row || !["waiting", "in_service"].includes(row.status)) {
    reply = "No encontramos un pedido activo con ese código. Si ya lo reclamaste, ¡buen provecho! Si no, preguntá en el mostrador.";
  } else {
    const { error } = await insforgeAdmin.database
      .from("walk_ins")
      .update({ notify_channel: msg.channel, notify_identity: msg.identity, customer_id: row.customer_id ?? msg.customerId })
      .eq("id", row.id);
    if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo vincular el pedido.", 500);
    const who = firstName(row.customer_name);
    const summary = orderDescription(row);
    const what = summary ? ` de ${summary}` : "";
    const ticket = formatTicket(row.ticket_number);
    reply = `¡Hola${who ? ` ${who}` : ""}! Recibimos tu pedido${ticket ? ` ${ticket}` : ""}${what}. Te escribimos por acá apenas esté listo para reclamar.`;
  }

  await insforgeAdmin.database
    .from("messages")
    .insert([{ organization_id: msg.organizationId, conversation_id: msg.conversationId, role: "assistant", content: reply }]);
  return reply;
}

/** Qué pidió: los productos del QR o, en registros del equipo, el servicio elegido. */
export function orderDescription(row: { order_items?: OrderItem[] | null; services?: { name: string } | null }): string {
  return summarizeOrderItems(row.order_items) || row.services?.name || "";
}

export function buildOrderReadyText(customerName: string | null, serviceName: string | null, businessName: string, ticketNumber?: number | null): string {
  const who = firstName(customerName);
  const ticket = formatTicket(ticketNumber);
  const what = serviceName ? ` de ${serviceName}` : "";
  const where = businessName ? ` en ${businessName}` : "";
  return `¡${who ? `${who}, t` : "T"}u pedido${ticket ? ` ${ticket}` : ""}${what} está listo! Acercate a reclamarlo${where}${ticket ? ` con tu ticket ${ticket}` : ""}.`;
}

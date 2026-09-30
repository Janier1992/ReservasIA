import { randomInt } from "node:crypto";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import { assertActiveService, normalizePhone, publicPageMode, resolveOrganization } from "../publicBooking/publicBookingService.js";

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

// Sin 0/O ni 1/I: el código también se lee y se puede dictar.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const TELEGRAM_START = /^\/start\s+([A-Za-z0-9]{10})\s*$/;
const WHATSAPP_ORDER = /pedido\s*#\s*([A-Za-z0-9]{10})\b/i;

export type NotifyChannel = "telegram" | "whatsapp";

export function generateOrderCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Código de pedido en "/start <código>" (Telegram) o "Pedido #<código>" (WhatsApp). */
export function extractOrderCode(text: string): string | null {
  const match = text.match(TELEGRAM_START) ?? text.match(WHATSAPP_ORDER);
  return match ? match[1].toUpperCase() : null;
}

export interface PublicOrderInput {
  serviceId: string;
  name: string;
  phone?: string;
  notes?: string;
}

export interface PublicOrderResult {
  code: string;
  position: number;
  serviceName: string;
  telegramUrl: string | null;
  whatsappUrl: string | null;
}

/** Enlaces para pedir el aviso, solo de los canales que el negocio tiene conectados. */
export async function loadNotifyLinks(organizationId: string, code: string): Promise<Pick<PublicOrderResult, "telegramUrl" | "whatsappUrl">> {
  const { data } = await insforgeAdmin.database
    .from("integrations")
    .select("provider, metadata")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .in("provider", ["telegram", "twilio"]);
  const rows = (data ?? []) as { provider: string; metadata: Record<string, unknown> | null }[];
  const botUsername = rows.find((r) => r.provider === "telegram")?.metadata?.bot_username;
  const whatsappNumber = rows.find((r) => r.provider === "twilio")?.metadata?.whatsapp_number;
  const whatsappDigits = typeof whatsappNumber === "string" ? whatsappNumber.replace(/\D/g, "") : "";
  return {
    telegramUrl: typeof botUsername === "string" && botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    whatsappUrl: whatsappDigits ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(`Pedido #${code}`)}` : null
  };
}

export async function createPublicOrder(slug: string, input: PublicOrderInput): Promise<PublicOrderResult> {
  const org = await resolveOrganization(slug);
  if (publicPageMode(org.business_type, org.disabled_modules) !== "order") {
    throw new AppError(ErrorCodes.ORGANIZATION_NOT_FOUND, "Este negocio no recibe pedidos en línea.", 404);
  }
  const service = await assertActiveService(org.id, input.serviceId);
  const code = generateOrderCode();
  const phone = input.phone ? normalizePhone(input.phone) : "";

  const { data: created, error } = await insforgeAdmin.database
    .from("walk_ins")
    .insert([
      {
        organization_id: org.id,
        customer_name: input.name.trim(),
        customer_phone: phone || null,
        service_id: service.id,
        notes: input.notes?.trim() || null,
        source: "qr",
        notify_code: code
      }
    ])
    .select("id, arrived_at, services(name)")
    .single();
  if (error || !created) {
    logger.error({ organizationId: org.id, err: error }, "public_order_insert_failed");
    throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo registrar el pedido. Intentá de nuevo.", 500);
  }
  const row = created as unknown as { id: string; arrived_at: string; services: { name: string } | null };

  const { data: ahead } = await insforgeAdmin.database
    .from("walk_ins")
    .select("id")
    .eq("organization_id", org.id)
    .eq("status", "waiting")
    .lte("arrived_at", row.arrived_at);

  return {
    code,
    position: Math.max(1, (ahead ?? []).length),
    serviceName: row.services?.name ?? "",
    ...(await loadNotifyLinks(org.id, code))
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
    .select("id, customer_id, customer_name, status, services(name)")
    .eq("organization_id", msg.organizationId)
    .eq("notify_code", msg.code)
    .maybeSingle();
  const row = order as { id: string; customer_id: string | null; customer_name: string; status: string; services: { name: string } | null } | null;

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
    const what = row.services?.name ? ` de ${row.services.name}` : "";
    reply = `¡Hola${who ? ` ${who}` : ""}! Recibimos tu pedido${what}. Te escribimos por acá apenas esté listo para reclamar.`;
  }

  await insforgeAdmin.database
    .from("messages")
    .insert([{ organization_id: msg.organizationId, conversation_id: msg.conversationId, role: "assistant", content: reply }]);
  return reply;
}

export function buildOrderReadyText(customerName: string | null, serviceName: string | null, businessName: string): string {
  const who = firstName(customerName);
  const what = serviceName ? ` de ${serviceName}` : "";
  const where = businessName ? ` en ${businessName}` : "";
  return `¡${who ? `${who}, t` : "T"}u pedido${what} está listo! Acercate a reclamarlo${where}.`;
}

import { randomInt } from "node:crypto";
import { insforgeAdmin } from "../../lib/insforge.js";

/**
 * Vincular el chat del cliente con su pedido por QR o su reserva de la página
 * pública. Un bot no puede escribirle primero a alguien, ni la web sabe si el
 * visitante usa Telegram o WhatsApp. Por eso se usa un código: el cliente
 * toca "Avisame por Telegram" (t.me/<bot>?start=<código>) o "por WhatsApp"
 * (wa.me/<número>?text=Pedido #<código> / Reserva #<código>) y ese primer
 * mensaje vincula su chat. En WhatsApp además abre la ventana de 24 h de Meta.
 */

export type NotifyChannel = "telegram" | "whatsapp";

// Sin 0/O ni 1/I: el código también se lee y se puede dictar.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const TELEGRAM_START = /^\/start\s+([A-Za-z0-9]{10})\s*$/;
const WHATSAPP_CODE = /(?:pedido|reserva)\s*#\s*([A-Za-z0-9]{10})\b/i;

export function generateOrderCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Código en "/start <código>" (Telegram) o "Pedido #<código>" / "Reserva #<código>" (WhatsApp). */
export function extractOrderCode(text: string): string | null {
  const match = text.match(TELEGRAM_START) ?? text.match(WHATSAPP_CODE);
  return match ? match[1].toUpperCase() : null;
}

export interface ConnectedChannels {
  botUsername: string | null;
  whatsappDigits: string | null;
}

/** Bot de Telegram y número de WhatsApp conectados del negocio. */
export async function loadConnectedChannels(organizationId: string): Promise<ConnectedChannels> {
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
  return { botUsername: typeof botUsername === "string" && botUsername ? botUsername : null, whatsappDigits: whatsappDigits || null };
}

/** Enlaces "Avisame por..." para un código, solo de los canales conectados. */
export function notifyLinksFor(channels: ConnectedChannels, code: string, label: "Pedido" | "Reserva") {
  return {
    telegramUrl: channels.botUsername ? `https://t.me/${channels.botUsername}?start=${code}` : null,
    whatsappUrl: channels.whatsappDigits ? `https://wa.me/${channels.whatsappDigits}?text=${encodeURIComponent(`${label} #${code}`)}` : null
  };
}

/** Enlaces para pedir el aviso, solo de los canales que el negocio tiene conectados. */
export async function loadNotifyLinks(
  organizationId: string,
  code: string,
  label: "Pedido" | "Reserva"
): Promise<{ telegramUrl: string | null; whatsappUrl: string | null }> {
  return notifyLinksFor(await loadConnectedChannels(organizationId), code, label);
}

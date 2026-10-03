import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import { generateOrderCode, loadConnectedChannels, notifyLinksFor, type NotifyChannel } from "./notifyLinks.js";

/**
 * Reservas de la página pública (todos los rubros): al reservar se les da un
 * código para que el cliente vincule su Telegram o WhatsApp; desde ahí le
 * llega la confirmación y el recordatorio antes de la cita.
 */

/** Da un código a la reserva y devuelve los enlaces "Avisame por..." de los canales conectados. */
export async function createReservationChatLink(
  organizationId: string,
  reservationId: string
): Promise<{ telegramUrl: string | null; whatsappUrl: string | null }> {
  const channels = await loadConnectedChannels(organizationId);
  // Sin canales conectados no hace falta código.
  if (!channels.botUsername && !channels.whatsappDigits) return { telegramUrl: null, whatsappUrl: null };

  const code = generateOrderCode();
  const { error } = await insforgeAdmin.database.from("reservations").update({ notify_code: code }).eq("id", reservationId);
  if (error) {
    // La reserva ya quedó hecha: sin código solo se pierde el aviso por chat.
    logger.warn({ organizationId, reservationId, err: error }, "reservation_chat_link_failed");
    return { telegramUrl: null, whatsappUrl: null };
  }
  return notifyLinksFor(channels, code, "Reserva");
}

export interface ReservationCodeMessage {
  organizationId: string;
  code: string;
  channel: NotifyChannel;
  identity: string;
  conversationId: string;
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export function buildReservationLinkedText(
  customerName: string | null,
  serviceName: string | null,
  businessName: string,
  startAt: string,
  timezone: string
): string {
  const who = firstName(customerName);
  const what = serviceName ? ` de ${serviceName}` : "";
  const where = businessName ? ` en ${businessName}` : "";
  const when = formatInTimeZone(new Date(startAt), timezone, "EEEE d 'de' MMMM 'a las' h:mm aaaa", { locale: es });
  return `¡Hola${who ? ` ${who}` : ""}! Tu reserva${what}${where} quedó confirmada para el ${when}${when.endsWith(".") ? "" : "."} Te recordamos por acá antes de la cita. Si necesitás cambiarla o cancelarla, escribinos.`;
}

/**
 * Si el código es de una reserva de este negocio, vincula el chat y devuelve
 * la confirmación (queda también en el Inbox). null si el código no es de una
 * reserva, para que quien llama responda como pedido.
 */
export async function linkReservationByCode(msg: ReservationCodeMessage, now = new Date()): Promise<string | null> {
  const { data } = await insforgeAdmin.database
    .from("reservations")
    .select("id, customer_name, status, start_at, services(name), customers(name)")
    .eq("organization_id", msg.organizationId)
    .eq("notify_code", msg.code)
    .maybeSingle();
  const row = data as {
    id: string;
    customer_name: string | null;
    status: string;
    start_at: string;
    services: { name: string } | null;
    customers: { name: string | null } | null;
  } | null;
  if (!row) return null;

  let reply: string;
  if (!["pending", "confirmed"].includes(row.status) || new Date(row.start_at).getTime() < now.getTime()) {
    reply = "Esa reserva ya no está activa (pasó, se canceló o ya se atendió). Si querés agendar de nuevo, escribinos por acá.";
  } else {
    const { error } = await insforgeAdmin.database
      .from("reservations")
      .update({ notify_channel: msg.channel, notify_identity: msg.identity })
      .eq("id", row.id);
    if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo vincular la reserva.", 500);
    const [{ data: org }, { data: profile }] = await Promise.all([
      insforgeAdmin.database.from("organizations").select("timezone").eq("id", msg.organizationId).maybeSingle(),
      insforgeAdmin.database.from("business_profiles").select("name").eq("organization_id", msg.organizationId).maybeSingle()
    ]);
    reply = buildReservationLinkedText(
      row.customer_name || row.customers?.name || null,
      row.services?.name ?? null,
      (profile as { name?: string } | null)?.name ?? "",
      row.start_at,
      (org as { timezone?: string } | null)?.timezone || "UTC"
    );
  }

  await insforgeAdmin.database
    .from("messages")
    .insert([{ organization_id: msg.organizationId, conversation_id: msg.conversationId, role: "assistant", content: reply }]);
  return reply;
}

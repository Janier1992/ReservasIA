import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { loadConnectedTelegramBotToken, sendTelegramMessage } from "../telegram/telegramService.js";
import { sendWhatsAppMessage } from "../twilio/twilioService.js";
import { buildOrderReadyText, type NotifyChannel } from "./publicOrderService.js";

const TELEGRAM_PREFIX = "telegram:";
/** Un pedido marcado listo hace más de esto ya se reclamó (o nadie espera el aviso). */
const MAX_READY_AGE_MS = 2 * 60 * 60 * 1000;
const BATCH_LIMIT = 50;
const CHECK_INTERVAL_MS = 10_000;

interface ReadyOrder {
  id: string;
  organization_id: string;
  customer_name: string | null;
  notify_channel: NotifyChannel;
  notify_identity: string;
  services: { name: string } | null;
}

/**
 * Toma el pedido con un update condicional (notified_at todavía vacío): si
 * dos instancias del server corren a la vez, solo una lo consigue y avisa.
 */
async function claim(orderId: string, now: Date): Promise<boolean> {
  const { data, error } = await insforgeAdmin.database
    .from("walk_ins")
    .update({ notified_at: now.toISOString() })
    .eq("id", orderId)
    .is("notified_at", null)
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

async function businessName(organizationId: string): Promise<string> {
  const { data } = await insforgeAdmin.database.from("business_profiles").select("name").eq("organization_id", organizationId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "";
}

async function deliver(order: ReadyOrder, text: string): Promise<void> {
  if (order.notify_channel === "telegram") {
    const botToken = await loadConnectedTelegramBotToken(order.organization_id);
    if (!botToken) throw new Error("El negocio ya no tiene Telegram conectado.");
    await sendTelegramMessage(botToken, order.notify_identity.slice(TELEGRAM_PREFIX.length), text);
  } else {
    await sendWhatsAppMessage(order.organization_id, order.notify_identity, text);
  }
}

/** Deja el aviso en la conversación del cliente, para que se vea en el Inbox. */
async function logInInbox(order: ReadyOrder, text: string): Promise<void> {
  const externalId = order.notify_channel === "telegram" ? order.notify_identity.slice(TELEGRAM_PREFIX.length) : order.notify_identity;
  const { data: conversation } = await insforgeAdmin.database
    .from("conversations")
    .select("id")
    .eq("organization_id", order.organization_id)
    .eq("channel", order.notify_channel)
    .eq("external_conversation_id", externalId)
    .maybeSingle();
  const conversationId = (conversation as { id?: string } | null)?.id;
  if (!conversationId) return;
  await insforgeAdmin.database
    .from("messages")
    .insert([{ organization_id: order.organization_id, conversation_id: conversationId, role: "assistant", content: text }]);
}

export async function sendReadyOrderNotifications(now = new Date()): Promise<{ sent: number; failed: number }> {
  const { data, error } = await insforgeAdmin.database
    .from("walk_ins")
    .select("id, organization_id, customer_name, notify_channel, notify_identity, services(name)")
    .not("ready_at", "is", null)
    .is("notified_at", null)
    .not("notify_identity", "is", null)
    .gte("ready_at", new Date(now.getTime() - MAX_READY_AGE_MS).toISOString())
    .limit(BATCH_LIMIT);
  if (error) {
    logger.warn({ err: error }, "order_ready_query_failed");
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const order of (data ?? []) as unknown as ReadyOrder[]) {
    if (!(await claim(order.id, now))) continue;
    const text = buildOrderReadyText(order.customer_name, order.services?.name ?? null, await businessName(order.organization_id));
    try {
      await deliver(order, text);
      await logInInbox(order, text);
      sent++;
    } catch (err) {
      failed++;
      logger.warn({ walkInId: order.id, organizationId: order.organization_id, err }, "order_ready_notify_failed");
      // Sin reintento automático (un bot bloqueado fallaría para siempre): el
      // panel muestra que no se pudo avisar.
      await insforgeAdmin.database
        .from("walk_ins")
        .update({ notify_error: err instanceof Error ? err.message.slice(0, 200) : "No se pudo enviar el aviso." })
        .eq("id", order.id);
    }
  }
  if (sent || failed) logger.info({ sent, failed }, "order_ready_batch_done");
  return { sent, failed };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runOnce(): Promise<void> {
  if (running) return; // Un envío lento no debe solapar la siguiente vuelta.
  running = true;
  try {
    await sendReadyOrderNotifications();
  } catch (err) {
    logger.error({ err }, "order_ready_run_failed");
  } finally {
    running = false;
  }
}

export function startOrderReadyNotifier(): void {
  runOnce();
  timer = setInterval(runOnce, CHECK_INTERVAL_MS);
}

export function stopOrderReadyNotifier(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

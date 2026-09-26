import { logger } from "../../lib/logger.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { handleInboundMessage } from "../conversations/inboundMessageHandler.js";
import { runAgentTurn } from "../agent/agentRuntime.js";
import { markAwaitingPaymentAsAwaitingConfirmation } from "../reservations/reservationsService.js";
import { notifyPaymentReceiptReceived } from "../notifications/pushService.js";
import { uploadPaymentReceipt } from "../storage/receiptsService.js";
import {
  downloadTelegramPhoto,
  getTelegramUpdates,
  listConnectedTelegramBots,
  sendTelegramMessage,
  sendTelegramTypingAction,
  TELEGRAM_POLL_CONFLICT,
  type TelegramUpdate
} from "./telegramService.js";

// El indicador de "escribiendo..." de Telegram desaparece solo a los pocos
// segundos, así que hay que refrescarlo mientras el turno del agente siga
// corriendo (puede tardar bastante con el modelo actual) — si no, el
// cliente ve el indicador un instante y después nada, dando la misma
// sensación de "no responde" que veníamos arreglando.
const TYPING_REFRESH_MS = 4_000;

async function withTypingIndicator<T>(botToken: string, chatId: number, task: Promise<T>): Promise<T> {
  void sendTelegramTypingAction(botToken, chatId);
  const interval = setInterval(() => {
    void sendTelegramTypingAction(botToken, chatId);
  }, TYPING_REFRESH_MS);
  try {
    return await task;
  } finally {
    clearInterval(interval);
  }
}

const REFRESH_INTERVAL_MS = 30_000;
const LONG_POLL_TIMEOUT_SECONDS = 25;
const ERROR_BACKOFF_MS = 5_000;

interface ActivePoller {
  controller: AbortController;
  botToken: string;
}

/**
 * Telegram no necesita un webhook con URL pública: cada organización que
 * conecta su bot se atiende con su propio loop de long-polling
 * (getUpdates). Esto permite correr el compute service detrás de NAT/
 * localhost sin pagar hosting con dominio público — a diferencia de
 * Twilio/Google, que sí lo necesitan para sus callbacks.
 *
 * Cada bot corre su propio loop independiente; un refresh periódico detecta
 * organizaciones que conectaron o desconectaron Telegram y arranca/para
 * los loops correspondientes.
 */
const activePollers = new Map<string, ActivePoller>();

// Cada `getTelegramUpdates` que resuelve (con o sin mensajes nuevos) prueba
// que el loop sigue vivo — se usa para que /api/health pueda distinguir
// "el proceso responde" de "el poller además sigue funcionando de verdad"
// (ver el bug de AbortSignal.any que dejó el poller trabado sin caerse el
// proceso).
let lastPollSuccessAt: number | null = null;

// Organizaciones cuyo último getUpdates devolvió 409 (otro proceso leyendo
// el mismo bot). Se limpia en cuanto un getUpdates de esa org vuelve a
// funcionar.
const conflictedOrgs = new Set<string>();

export function getTelegramPollerHealth(): {
  activeOrgCount: number;
  lastPollSuccessAt: string | null;
  conflictOrgCount: number;
} {
  return {
    activeOrgCount: activePollers.size,
    lastPollSuccessAt: lastPollSuccessAt ? new Date(lastPollSuccessAt).toISOString() : null,
    conflictOrgCount: conflictedOrgs.size
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function telegramDisplayName(from: NonNullable<TelegramUpdate["message"]>["from"]): string | undefined {
  if (!from) return undefined;
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return fullName || undefined;
}

async function processPhotoMessage(
  organizationId: string,
  botToken: string,
  chatId: number,
  message: NonNullable<TelegramUpdate["message"]>
): Promise<void> {
  const externalIdentity = `telegram:${chatId}`;

  const inbound = await handleInboundMessage({
    organizationId,
    channel: "telegram",
    externalIdentity,
    externalConversationId: String(chatId),
    content: "[Foto de comprobante de pago]",
    externalMessageId: String(message.message_id),
    messageType: "image",
    customerName: telegramDisplayName(message.from)
  });
  if (inbound.duplicate) return;
  const { conversationId, customerId } = inbound;

  try {
    const { bytes, mimeType } = await downloadTelegramPhoto(botToken, message.photo!);
    const storagePath = await uploadPaymentReceipt(organizationId, conversationId, bytes, mimeType);
    await insforgeAdmin.database
      .from("messages")
      .update({ metadata: { storage_path: storagePath, mime_type: mimeType } })
      .eq("conversation_id", conversationId)
      .eq("external_message_id", String(message.message_id));

    const reservation = await markAwaitingPaymentAsAwaitingConfirmation(organizationId, customerId);
    if (reservation) {
      await notifyPaymentReceiptReceived(organizationId, reservation.customer_name);
      await sendTelegramMessage(
        botToken,
        chatId,
        "¡Gracias! Recibimos tu comprobante de pago. Alguien del negocio lo va a revisar en breve para confirmar tu reserva."
      );
    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        "Recibimos tu foto, pero no encontramos una reserva esperando el pago. Si crees que es un error, contactá directamente al negocio."
      );
    }
  } catch (err) {
    logger.error({ organizationId, chatId, err }, "telegram_receipt_photo_processing_failed");
    await sendTelegramMessage(
      botToken,
      chatId,
      "No pudimos procesar la foto del comprobante. Por favor intentá enviarla de nuevo."
    );
  }
}

export async function processUpdate(organizationId: string, botToken: string, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.chat?.id) return;

  const chatId = message.chat.id;

  // Una foto de comprobante de pago nunca pasa por el agente: la ingesta y
  // el cambio de estado de la reserva son deterministas (punto 27 de las
  // reglas del agente — solo un humano confirma el pago).
  if (message.photo && message.photo.length > 0) {
    await processPhotoMessage(organizationId, botToken, chatId, message);
    return;
  }

  if (!message.text) return;

  const externalIdentity = `telegram:${chatId}`;

  const inbound = await handleInboundMessage({
    organizationId,
    channel: "telegram",
    externalIdentity,
    externalConversationId: String(chatId),
    content: message.text,
    externalMessageId: String(message.message_id),
    customerName: telegramDisplayName(message.from)
  });
  // Otro proceso ya tomó este update (dos instancias leyendo el mismo bot):
  // correr un segundo turno del agente duplicaría respuestas y reservas.
  if (inbound.duplicate) return;
  const { conversationId, customerId } = inbound;

  const result = await withTypingIndicator(
    botToken,
    chatId,
    runAgentTurn({
      organizationId,
      conversationId,
      customerId,
      customerPhone: externalIdentity,
      requestId: `telegram:${update.update_id}`
    })
  );

  if (result.reply) {
    await sendTelegramMessage(botToken, chatId, result.reply);
  }
}

async function runPollLoop(organizationId: string, botToken: string, signal: AbortSignal): Promise<void> {
  let offset = 0;
  logger.info({ organizationId }, "telegram_poller_started");

  while (!signal.aborted) {
    try {
      const updates = await getTelegramUpdates(botToken, offset, LONG_POLL_TIMEOUT_SECONDS, signal);
      lastPollSuccessAt = Date.now();
      conflictedOrgs.delete(organizationId);

      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await processUpdate(organizationId, botToken, update);
        } catch (err) {
          logger.error({ organizationId, updateId: update.update_id, err }, "telegram_update_processing_failed");
        }
      }
    } catch (err) {
      if (signal.aborted || (err as { name?: string }).name === "AbortError") break;
      if ((err as { code?: string }).code === TELEGRAM_POLL_CONFLICT) {
        conflictedOrgs.add(organizationId);
        logger.error(
          { organizationId },
          "telegram_poll_conflict_another_instance_running: otro proceso (¿server local con credenciales de producción?) está leyendo este bot"
        );
      } else {
        logger.warn({ organizationId, err }, "telegram_get_updates_failed");
      }
      await sleep(ERROR_BACKOFF_MS, signal);
    }
  }

  logger.info({ organizationId }, "telegram_poller_stopped");
}

async function refreshPollers(): Promise<void> {
  let connectedBots;
  try {
    connectedBots = await listConnectedTelegramBots();
  } catch (err) {
    logger.error({ err }, "telegram_refresh_pollers_failed");
    return;
  }

  const connectedByOrg = new Map(connectedBots.map((bot) => [bot.organizationId, bot.botToken]));

  for (const [organizationId, poller] of activePollers) {
    const stillConnectedToken = connectedByOrg.get(organizationId);
    if (!stillConnectedToken || stillConnectedToken !== poller.botToken) {
      poller.controller.abort();
      activePollers.delete(organizationId);
      conflictedOrgs.delete(organizationId);
    }
  }

  for (const [organizationId, botToken] of connectedByOrg) {
    if (activePollers.has(organizationId)) continue;
    const controller = new AbortController();
    activePollers.set(organizationId, { controller, botToken });
    // Línea de base optimista: recién arrancado, todavía no tuvo tiempo de
    // completar su primer getUpdates (hasta LONG_POLL_TIMEOUT_SECONDS) —
    // sin esto, /api/health marcaría "degraded" por unos segundos en cada
    // arranque/redeploy.
    lastPollSuccessAt = Date.now();
    runPollLoop(organizationId, botToken, controller.signal).catch((err) => {
      logger.error({ organizationId, err }, "telegram_poll_loop_crashed");
      activePollers.delete(organizationId);
    });
  }
}

let refreshTimer: NodeJS.Timeout | null = null;

export function startTelegramPollingManager(): void {
  refreshPollers();
  refreshTimer = setInterval(refreshPollers, REFRESH_INTERVAL_MS);
}

export function stopTelegramPollingManager(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  for (const poller of activePollers.values()) poller.controller.abort();
  activePollers.clear();
}

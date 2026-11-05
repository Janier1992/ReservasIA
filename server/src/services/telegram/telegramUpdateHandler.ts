import { logger } from "../../lib/logger.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { handleInboundMessage } from "../conversations/inboundMessageHandler.js";
import { runAgentTurn } from "../agent/agentRuntime.js";
import { checkAgentTurn, RATE_LIMIT_NOTICE } from "../agent/agentRateLimit.js";
import { markAwaitingPaymentAsAwaitingConfirmation } from "../reservations/reservationsService.js";
import { notifyPaymentReceiptReceived } from "../notifications/pushService.js";
import { uploadPaymentReceipt } from "../storage/receiptsService.js";
import { extractOrderCode, handleOrderCodeMessage } from "../publicOrders/publicOrderService.js";
import { downloadTelegramPhoto, sendTelegramMessage, sendTelegramTypingAction, type TelegramUpdate } from "./telegramService.js";

/**
 * Qué hacer con cada mensaje que llega a un bot de Telegram, venga por
 * long-polling (telegramPollingManager) o por webhook (routes/webhooks).
 * handleInboundMessage descarta los repetidos, así que un reintento de
 * Telegram o dos instancias recibiendo el mismo mensaje no duplican nada.
 */

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

  // "/start <código>" llega desde el botón "Avisame por Telegram" de un pedido
  // por QR: se vincula el chat al pedido sin pasar por el agente.
  const orderCode = extractOrderCode(message.text);
  if (orderCode) {
    const reply = await handleOrderCodeMessage({
      organizationId,
      code: orderCode,
      channel: "telegram",
      identity: externalIdentity,
      customerId,
      conversationId
    });
    await sendTelegramMessage(botToken, chatId, reply);
    return;
  }

  // Ráfaga anormal de mensajes: el mensaje ya quedó guardado, pero no se
  // llama a la IA por cada uno (ver agentRateLimit.ts).
  const decision = checkAgentTurn(organizationId, externalIdentity);
  if (decision !== "allowed") {
    logger.warn({ organizationId, conversationId, decision }, "agent_turn_rate_limited");
    if (decision === "limited_notify") await sendTelegramMessage(botToken, chatId, RATE_LIMIT_NOTICE);
    return;
  }

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

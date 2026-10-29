import { logger } from "../../lib/logger.js";
import { handleInboundMessage } from "../conversations/inboundMessageHandler.js";
import { runAgentTurn } from "../agent/agentRuntime.js";
import { checkAgentTurn, RATE_LIMIT_NOTICE } from "../agent/agentRateLimit.js";
import { extractOrderCode, handleOrderCodeMessage } from "../publicOrders/publicOrderService.js";
import { normalizeWhatsAppPhone, sendYCloudText, type YCloudIntegration } from "./ycloudService.js";

/** Lo que usamos de un evento de webhook de YCloud (el resto se ignora). */
export interface YCloudEvent {
  id?: string;
  type?: string;
  whatsappInboundMessage?: {
    id?: string;
    wamid?: string;
    from?: string;
    to?: string;
    type?: string;
    text?: { body?: string };
    customerProfile?: { name?: string };
    groupId?: string;
  };
  whatsappMessage?: {
    id?: string;
    wamid?: string;
    from?: string;
    to?: string;
    recipient?: string;
    type?: string;
    text?: { body?: string };
  };
}

const MEDIA_LABELS: Record<string, string> = {
  image: "[Foto]",
  video: "[Video]",
  audio: "[Audio]",
  document: "[Documento]",
  sticker: "[Sticker]",
  location: "[Ubicación]",
  contacts: "[Contacto]"
};

/** Un mensaje que el cliente le escribió al número del negocio. */
async function handleCustomerMessage(organizationId: string, integration: YCloudIntegration, event: YCloudEvent): Promise<void> {
  const message = event.whatsappInboundMessage;
  if (!message?.from || message.groupId) return;
  // Un webhook solo debería traer mensajes del número conectado; si no, se descarta.
  if (message.to && normalizeWhatsAppPhone(message.to) !== integration.phoneNumber) {
    logger.warn({ organizationId }, "ycloud_inbound_for_other_number_ignored");
    return;
  }
  // El agente solo lee texto; fotos, audios y demás los atiende el negocio desde su app.
  const text = message.type === "text" ? message.text?.body?.trim() : undefined;
  if (!text) return;

  const customerPhone = normalizeWhatsAppPhone(message.from);
  const inbound = await handleInboundMessage({
    organizationId,
    channel: "whatsapp",
    externalIdentity: customerPhone,
    externalConversationId: customerPhone,
    content: text,
    externalMessageId: message.wamid ?? message.id,
    customerName: message.customerProfile?.name
  });
  // YCloud reintenta las entregas: el mismo mensaje no corre dos turnos del agente.
  if (inbound.duplicate) return;
  const { conversationId, customerId } = inbound;

  // "Pedido #<código>" del botón "Avisame por WhatsApp" de un pedido por QR.
  const orderCode = extractOrderCode(text);
  if (orderCode) {
    const reply = await handleOrderCodeMessage({
      organizationId,
      code: orderCode,
      channel: "whatsapp",
      identity: customerPhone,
      customerId,
      conversationId
    });
    await sendYCloudText(integration, customerPhone, reply);
    return;
  }

  // Ráfaga anormal de mensajes: el mensaje ya quedó guardado, pero no se
  // llama a la IA por cada uno (ver agentRateLimit.ts).
  const decision = checkAgentTurn(organizationId, `whatsapp:${customerPhone}`);
  if (decision !== "allowed") {
    logger.warn({ organizationId, conversationId, decision }, "agent_turn_rate_limited");
    if (decision === "limited_notify") await sendYCloudText(integration, customerPhone, RATE_LIMIT_NOTICE);
    return;
  }

  const result = await runAgentTurn({
    organizationId,
    conversationId,
    customerId,
    customerPhone,
    requestId: `ycloud:${message.wamid ?? message.id ?? event.id}`
  });
  if (result.reply) await sendYCloudText(integration, customerPhone, result.reply);
}

/**
 * Eco de lo que el negocio escribió desde su app de WhatsApp Business: queda
 * en el Inbox y en el historial del agente como mensaje del equipo, y eso
 * pausa al agente en esa conversación (ver HUMAN_TAKEOVER_MS).
 */
async function handleBusinessEcho(organizationId: string, event: YCloudEvent): Promise<void> {
  const message = event.whatsappMessage;
  const to = message?.to ?? message?.recipient;
  if (!message || !to) return;
  const customerPhone = normalizeWhatsAppPhone(to);
  const content = message.text?.body?.trim() || MEDIA_LABELS[message.type ?? ""] || "[Mensaje]";
  await handleInboundMessage({
    organizationId,
    channel: "whatsapp",
    externalIdentity: customerPhone,
    externalConversationId: customerPhone,
    content,
    externalMessageId: message.wamid ?? message.id,
    role: "staff",
    metadata: { source: "whatsapp_business_app" }
  });
}

export async function handleYCloudEvent(organizationId: string, integration: YCloudIntegration, event: YCloudEvent): Promise<void> {
  if (event.type === "whatsapp.inbound_message.received") {
    await handleCustomerMessage(organizationId, integration, event);
  } else if (event.type === "whatsapp.smb.message.echoes") {
    await handleBusinessEcho(organizationId, event);
  }
}

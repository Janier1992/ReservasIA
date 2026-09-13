import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import { findOrCreateCustomerByPhone } from "../customers/customersService.js";
import { MAX_MESSAGE_LENGTH } from "../../config/env.js";
import type { ConversationChannel } from "../../types/domain.js";

/**
 * Lógica compartida de "mensaje entrante" para cualquier canal
 * (WhatsApp/Twilio, Telegram, y los que se agreguen después): identifica
 * al cliente, la conversación activa, y persiste el mensaje. El resto del
 * flujo (correr el agente y enviar la respuesta) es específico de cada
 * canal porque cada uno tiene su propia forma de mandar mensajes.
 *
 * `externalIdentity` es el identificador único de ese cliente en ese canal
 * (el teléfono normalizado para WhatsApp, `telegram:<chat_id>` para
 * Telegram) — se guarda en `customers.phone`, que ya es único por
 * organización + valor.
 */
export async function findOrCreateActiveConversation(
  organizationId: string,
  customerId: string,
  channel: ConversationChannel,
  externalConversationId: string
) {
  // La restricción real de unicidad en la base es (organization_id, channel,
  // external_conversation_id) — NO incluye customer_id. Por eso la búsqueda
  // tiene que hacerse por esa misma combinación: si se buscara por
  // customer_id (como antes) y el cliente original se borra y se re-crea
  // (ej. al usar "Eliminar cliente" en el dashboard), la fila existente ya
  // no aparece en la búsqueda, pero el INSERT igual choca contra ella y
  // revienta con un error de clave duplicada.
  const { data: existing } = await insforgeAdmin.database
    .from("conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("external_conversation_id", externalConversationId)
    .maybeSingle();

  if (existing) {
    if (existing.customer_id !== customerId || existing.status !== "active") {
      const { data: updated, error } = await insforgeAdmin.database
        .from("conversations")
        .update({ customer_id: customerId, status: "active" })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error || !updated) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo reabrir la conversación.", 500);
      return updated;
    }
    return existing;
  }

  const { data: created, error } = await insforgeAdmin.database
    .from("conversations")
    .insert([
      {
        organization_id: organizationId,
        customer_id: customerId,
        channel,
        external_conversation_id: externalConversationId,
        status: "active"
      }
    ])
    .select("*")
    .single();

  if (error || !created) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo crear la conversación.", 500);
  return created;
}

export interface InboundMessageInput {
  organizationId: string;
  channel: ConversationChannel;
  externalIdentity: string;
  externalConversationId: string;
  content: string;
  externalMessageId?: string;
}

export interface InboundMessageResult {
  conversationId: string;
  customerId: string;
}

export async function handleInboundMessage(input: InboundMessageInput): Promise<InboundMessageResult> {
  const customer = await findOrCreateCustomerByPhone(input.organizationId, input.externalIdentity);
  const conversation = await findOrCreateActiveConversation(
    input.organizationId,
    customer.id,
    input.channel,
    input.externalConversationId
  );

  const content = input.content.slice(0, MAX_MESSAGE_LENGTH);
  await insforgeAdmin.database.from("messages").insert([
    {
      organization_id: input.organizationId,
      conversation_id: conversation.id,
      role: "user",
      content,
      external_message_id: input.externalMessageId ?? null
    }
  ]);

  return { conversationId: conversation.id, customerId: customer.id };
}

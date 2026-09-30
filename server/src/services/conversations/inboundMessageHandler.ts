import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
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
  messageType?: string;
  metadata?: Record<string, unknown>;
  /**
   * Nombre visible del cliente en el canal (first_name/last_name de
   * Telegram, ProfileName de WhatsApp), si el canal lo provee. Para
   * Telegram, `externalIdentity` es un `telegram:<chat_id>` sintético (la
   * API no comparte el teléfono real), así que sin esto el cliente queda
   * sin nombre hasta que el agente lo capture en una reserva — y el Inbox
   * termina mostrando ese id críptico en vez de un nombre.
   */
  customerName?: string;
}

export type InboundMessageResult =
  | { duplicate: false; conversationId: string; customerId: string }
  | { duplicate: true };

/**
 * Reclama el mensaje de forma atómica en la base compartida. Devuelve false
 * si otro proceso ya lo reclamó (ver migración inbound-message-claims:
 * dos instancias leyendo el mismo bot reciben el mismo update). Ante
 * cualquier otro error falla "abierto" — perder un mensaje del cliente es
 * peor que arriesgar un duplicado.
 */
async function claimInboundMessage(input: InboundMessageInput): Promise<boolean> {
  if (!input.externalMessageId) return true;
  const { error } = await insforgeAdmin.database.from("inbound_message_claims").insert([
    {
      organization_id: input.organizationId,
      channel: input.channel,
      external_conversation_id: input.externalConversationId,
      external_message_id: input.externalMessageId
    }
  ]);
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  logger.warn({ organizationId: input.organizationId, err: error }, "inbound_message_claim_failed_processing_anyway");
  return true;
}

export async function handleInboundMessage(input: InboundMessageInput): Promise<InboundMessageResult> {
  if (!(await claimInboundMessage(input))) {
    logger.warn(
      { organizationId: input.organizationId, channel: input.channel, externalMessageId: input.externalMessageId },
      "inbound_message_duplicate_skipped"
    );
    return { duplicate: true };
  }

  try {
    return await persistInboundMessage(input);
  } catch (err) {
    // El claim ya se tomó pero el mensaje no quedó guardado: si no se libera,
    // una reentrega del mismo mensaje (reintento de Twilio, otro proceso) se
    // descartaría como duplicado y el mensaje del cliente se perdería.
    await releaseInboundMessageClaim(input);
    throw err;
  }
}

async function releaseInboundMessageClaim(input: InboundMessageInput): Promise<void> {
  if (!input.externalMessageId) return;
  const { error } = await insforgeAdmin.database
    .from("inbound_message_claims")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("channel", input.channel)
    .eq("external_conversation_id", input.externalConversationId)
    .eq("external_message_id", input.externalMessageId);
  if (error) logger.warn({ organizationId: input.organizationId, err: error }, "inbound_message_claim_release_failed");
}

async function persistInboundMessage(input: InboundMessageInput): Promise<InboundMessageResult> {
  const customer = await findOrCreateCustomerByPhone(input.organizationId, input.externalIdentity, input.customerName);
  const conversation = await findOrCreateActiveConversation(
    input.organizationId,
    customer.id,
    input.channel,
    input.externalConversationId
  );

  const content = input.content.slice(0, MAX_MESSAGE_LENGTH);
  // El SDK devuelve { error } en vez de lanzar: sin este chequeo, un fallo al
  // guardar el mensaje no llegaría al catch de handleInboundMessage y el
  // claim nunca se liberaría — justo el caso que esa liberación cubre.
  const { error: messageError } = await insforgeAdmin.database.from("messages").insert([
    {
      organization_id: input.organizationId,
      conversation_id: conversation.id,
      role: "user",
      content,
      external_message_id: input.externalMessageId ?? null,
      message_type: input.messageType ?? "text",
      metadata: input.metadata ?? {}
    }
  ]);
  if (messageError) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo guardar el mensaje entrante.", 500);

  return { duplicate: false, conversationId: conversation.id, customerId: customer.id };
}

// Un claim solo sirve mientras el mismo mensaje pueda volver a llegar
// (reintentos de Twilio, otro proceso leyendo el bot): eso pasa en minutos,
// así que una semana de retención sobra y evita que la tabla crezca sin fin.
export const INBOUND_CLAIM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function purgeOldInboundMessageClaims(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - INBOUND_CLAIM_RETENTION_MS).toISOString();
  const { error } = await insforgeAdmin.database.from("inbound_message_claims").delete().lt("claimed_at", cutoff);
  if (error) throw error;
}

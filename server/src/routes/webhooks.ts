import { Router } from "express";
import express from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { AppError, ErrorCodes } from "../utils/AppError.js";
import { resolveOrganizationForIncomingNumber, sendTwilioWhatsAppMessage, validateTwilioSignature } from "../services/twilio/twilioService.js";
import { handleInboundMessage } from "../services/conversations/inboundMessageHandler.js";
import { runAgentTurn } from "../services/agent/agentRuntime.js";
import { extractOrderCode, handleOrderCodeMessage } from "../services/publicOrders/publicOrderService.js";
import { webhookRateLimiter } from "../middleware/rateLimit.js";
import { processUpdate } from "../services/telegram/telegramUpdateHandler.js";
import { botTokenForWebhook, isValidTelegramWebhookSecret } from "../services/telegram/telegramWebhookManager.js";
import type { TelegramUpdate } from "../services/telegram/telegramService.js";
import { loadYCloudIntegration, verifyYCloudSignature } from "../services/ycloud/ycloudService.js";
import { handleYCloudEvent, type YCloudEvent } from "../services/ycloud/ycloudEventHandler.js";
import type { RawBodyRequest } from "../app.js";

export const webhooksRouter = Router();

const twilioPayloadSchema = z.object({
  From: z.string().min(1, "From es requerido"),
  To: z.string().min(1, "To es requerido"),
  Body: z.string().min(1, "Body es requerido"),
  MessageSid: z.string().optional(),
  ProfileName: z.string().optional()
});

function stripWhatsappPrefix(value: string): string {
  return value.replace(/^whatsapp:/, "");
}

/**
 * Webhook público de Twilio. Usa su propio parser urlencoded (Twilio no
 * envía JSON) y NUNCA asume que existe una única organización: el
 * enrutamiento se hace por el número "To" en cada request (punto 25).
 */
webhooksRouter.post(
  "/twilio/whatsapp",
  webhookRateLimiter,
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      const parsed = twilioPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(ErrorCodes.WEBHOOK_INVALID_PAYLOAD, "Payload de Twilio inválido o incompleto.", 400);
      }
      const { From, To, Body, MessageSid, ProfileName } = parsed.data;

      const routing = await resolveOrganizationForIncomingNumber(To);
      if (!routing) {
        throw new AppError(ErrorCodes.ORGANIZATION_NOT_FOUND, "No se encontró una organización para este número de WhatsApp.", 404);
      }

      const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const signature = req.headers["x-twilio-signature"] as string | undefined;
      const validSignature = validateTwilioSignature(routing.credentials.auth_token, signature, fullUrl, req.body);
      if (!validSignature) {
        throw new AppError(ErrorCodes.WEBHOOK_INVALID_SIGNATURE, "Firma de Twilio inválida.", 403);
      }

      const fromPhone = stripWhatsappPrefix(From);
      const inbound = await handleInboundMessage({
        organizationId: routing.organizationId,
        channel: "whatsapp",
        externalIdentity: fromPhone,
        externalConversationId: fromPhone,
        content: Body,
        externalMessageId: MessageSid,
        customerName: ProfileName
      });

      // Reintento de Twilio (o de otro proceso) para un MessageSid ya
      // procesado: se confirma igual para que Twilio deje de reintentar.
      if (inbound.duplicate) {
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }
      const { conversationId, customerId } = inbound;

      // Respondemos de inmediato a Twilio (< 15s) y procesamos el agente de
      // forma asíncrona, enviando la respuesta luego vía la API REST de
      // Twilio. Esto evita timeouts del webhook cuando el loop de tool
      // calling necesita varias rondas.
      res.status(200).type("text/xml").send("<Response></Response>");

      // "Pedido #<código>" llega desde el botón "Avisame por WhatsApp" de un
      // pedido por QR: se vincula el chat al pedido sin pasar por el agente.
      const orderCode = extractOrderCode(Body);
      if (orderCode) {
        handleOrderCodeMessage({
          organizationId: routing.organizationId,
          code: orderCode,
          channel: "whatsapp",
          identity: fromPhone,
          customerId,
          conversationId
        })
          .then((reply) => sendTwilioWhatsAppMessage(routing.organizationId, fromPhone, reply))
          .catch((err) => logger.error({ organizationId: routing.organizationId, conversationId, err }, "order_code_link_failed"));
        return;
      }

      runAgentTurn({
        organizationId: routing.organizationId,
        conversationId,
        customerId,
        customerPhone: fromPhone,
        requestId: MessageSid
      })
        .then(async (result) => {
          if (result.reply) {
            await sendTwilioWhatsAppMessage(routing.organizationId, fromPhone, result.reply);
          }
        })
        .catch((err) => {
          logger.error({ organizationId: routing.organizationId, conversationId, err }, "agent_turn_failed");
        });
    } catch (err) {
      next(err);
    }
  }
);

const telegramParamsSchema = z.object({ organizationId: z.string().uuid() });

/**
 * Webhook de Telegram (modo TELEGRAM_MODE=webhook): una URL por negocio y un
 * secreto por negocio en el header X-Telegram-Bot-Api-Secret-Token. Responde
 * 200 apenas valida (Telegram reintenta si tarda) y procesa después; los
 * reintentos repetidos se descartan en handleInboundMessage. Sin el
 * limitador por IP de Twilio: todos los mensajes llegan desde las IPs de
 * Telegram y el secreto ya filtra lo ajeno.
 */
webhooksRouter.post("/telegram/:organizationId", async (req, res, next) => {
  try {
    const params = telegramParamsSchema.safeParse(req.params);
    if (!params.success) throw new AppError(ErrorCodes.WEBHOOK_INVALID_PAYLOAD, "Negocio inválido.", 400);
    const { organizationId } = params.data;

    const secret = req.get("x-telegram-bot-api-secret-token");
    if (!isValidTelegramWebhookSecret(organizationId, secret)) {
      throw new AppError(ErrorCodes.WEBHOOK_INVALID_SIGNATURE, "Secreto de Telegram inválido.", 403);
    }

    const update = req.body as TelegramUpdate;
    // Telegram necesita el 200 para no reintentar; lo que no es un mensaje se ignora.
    res.status(200).json({ ok: true });
    if (typeof update?.update_id !== "number" || !update.message) return;

    const botToken = await botTokenForWebhook(organizationId);
    if (!botToken) {
      logger.warn({ organizationId }, "telegram_webhook_without_connected_bot");
      return;
    }
    processUpdate(organizationId, botToken, update).catch((err) =>
      logger.error({ organizationId, updateId: update.update_id, err }, "telegram_update_processing_failed")
    );
  } catch (err) {
    next(err);
  }
});

const ycloudParamsSchema = z.object({ organizationId: z.string().uuid() });

/**
 * Webhook de YCloud (WhatsApp en coexistencia con la app del negocio): una
 * URL por negocio, registrada al conectar (functions/ycloud-connect.ts), y la
 * firma YCloud-Signature con el secreto de ese endpoint. Responde 200 apenas
 * valida (YCloud reintenta si tarda) y procesa después; las reentregas del
 * mismo mensaje se descartan en handleInboundMessage.
 */
webhooksRouter.post("/ycloud/:organizationId", async (req, res, next) => {
  try {
    const params = ycloudParamsSchema.safeParse(req.params);
    if (!params.success) throw new AppError(ErrorCodes.WEBHOOK_INVALID_PAYLOAD, "Negocio inválido.", 400);
    const { organizationId } = params.data;

    const integration = await loadYCloudIntegration(organizationId);
    if (!integration) throw new AppError(ErrorCodes.INTEGRATION_NOT_CONNECTED, "Este negocio no tiene WhatsApp por YCloud conectado.", 404);

    const rawBody = (req as RawBodyRequest).rawBody ?? "";
    if (!verifyYCloudSignature(integration.credentials.webhook_secret, req.get("ycloud-signature"), rawBody)) {
      throw new AppError(ErrorCodes.WEBHOOK_INVALID_SIGNATURE, "Firma de YCloud inválida.", 403);
    }

    res.status(200).json({ ok: true });
    const event = req.body as YCloudEvent;
    handleYCloudEvent(organizationId, integration, event).catch((err) =>
      logger.error({ organizationId, eventId: event?.id, eventType: event?.type, err }, "ycloud_event_processing_failed")
    );
  } catch (err) {
    next(err);
  }
});

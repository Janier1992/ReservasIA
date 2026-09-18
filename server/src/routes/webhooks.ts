import { Router } from "express";
import express from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { AppError, ErrorCodes } from "../utils/AppError.js";
import { resolveOrganizationForIncomingNumber, sendWhatsAppMessage, validateTwilioSignature } from "../services/twilio/twilioService.js";
import { handleInboundMessage } from "../services/conversations/inboundMessageHandler.js";
import { runAgentTurn } from "../services/agent/agentRuntime.js";
import { webhookRateLimiter } from "../middleware/rateLimit.js";

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
      const { conversationId, customerId } = await handleInboundMessage({
        organizationId: routing.organizationId,
        channel: "whatsapp",
        externalIdentity: fromPhone,
        externalConversationId: fromPhone,
        content: Body,
        externalMessageId: MessageSid,
        customerName: ProfileName
      });

      // Respondemos de inmediato a Twilio (< 15s) y procesamos el agente de
      // forma asíncrona, enviando la respuesta luego vía la API REST de
      // Twilio. Esto evita timeouts del webhook cuando el loop de tool
      // calling necesita varias rondas.
      res.status(200).type("text/xml").send("<Response></Response>");

      runAgentTurn({
        organizationId: routing.organizationId,
        conversationId,
        customerId,
        customerPhone: fromPhone,
        requestId: MessageSid
      })
        .then(async (result) => {
          if (result.reply) {
            await sendWhatsAppMessage(routing.organizationId, fromPhone, result.reply);
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

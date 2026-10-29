import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { AppError, ErrorCodes } from "../utils/AppError.js";
import { processUpdate } from "../services/telegram/telegramUpdateHandler.js";
import { botTokenForWebhook, isValidTelegramWebhookSecret } from "../services/telegram/telegramWebhookManager.js";
import type { TelegramUpdate } from "../services/telegram/telegramService.js";
import { loadYCloudIntegration, verifyYCloudSignature } from "../services/ycloud/ycloudService.js";
import { handleYCloudEvent, type YCloudEvent } from "../services/ycloud/ycloudEventHandler.js";
import type { RawBodyRequest } from "../app.js";

export const webhooksRouter = Router();

const telegramParamsSchema = z.object({ organizationId: z.string().uuid() });

/**
 * Webhook de Telegram (modo TELEGRAM_MODE=webhook): una URL por negocio y un
 * secreto por negocio en el header X-Telegram-Bot-Api-Secret-Token. Responde
 * 200 apenas valida (Telegram reintenta si tarda) y procesa después; los
 * reintentos repetidos se descartan en handleInboundMessage. Sin limitador
 * de tasa propio: todos los mensajes llegan desde las IPs de Telegram y el
 * secreto ya filtra lo ajeno.
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

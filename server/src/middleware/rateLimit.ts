import rateLimit from "express-rate-limit";
import { ErrorCodes } from "../utils/AppError.js";

function jsonRateLimitHandler(_req: unknown, res: import("express").Response) {
  res.status(429).json({
    error: { code: ErrorCodes.RATE_LIMITED, message: "Demasiadas solicitudes. Intentá de nuevo en unos minutos." }
  });
}

/** Webhook entrante de Twilio (integración anterior). Un número no debería enviar cientos de mensajes por minuto. */
export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler
});

/** API pública general del dashboard. */
export const publicApiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler
});

import { Router } from "express";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { handleGoogleOAuthCallback } from "../services/google/googleService.js";

export const integrationsRouter = Router();

/**
 * Único endpoint de integraciones que sigue viviendo en el compute
 * service: Google redirige el navegador acá directamente (no hay
 * Authorization header posible). La autenticidad/tenant se garantiza con
 * el `state` firmado por la Edge Function google-oauth-start. El resto de
 * las operaciones de integraciones (conectar/desconectar canales y
 * Google, generar la URL de consentimiento) vive en Edge Functions,
 * porque el frontend no tiene forma de adjuntar el token de InsForge a
 * este servicio externo (ver PRP).
 */
integrationsRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  if (!code || !state) {
    res.redirect(`${env.APP_URL}/dashboard/integrations?google=error`);
    return;
  }

  try {
    await handleGoogleOAuthCallback(code, state);
    res.redirect(`${env.APP_URL}/dashboard/integrations?google=connected`);
  } catch (err) {
    // Solo el mensaje: el error de googleapis puede traer la petición con tokens.
    logger.warn({ reason: err instanceof Error ? err.message : String(err) }, "google_oauth_callback_failed");
    res.redirect(`${env.APP_URL}/dashboard/integrations?google=error`);
  }
});

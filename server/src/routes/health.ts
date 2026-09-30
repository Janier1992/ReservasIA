import { Router } from "express";
import { env } from "../config/env.js";
import { getTelegramPollerHealth } from "../services/telegram/telegramPollingManager.js";

export const healthRouter = Router();

// Si hay negocios con Telegram conectado pero ningún poller resolvió un
// getUpdates en este lapso, algo se trabó por dentro aunque el proceso
// Express siga respondiendo — el long-poll normal completa cada ~25-30s,
// así que 2 minutos da margen de sobra sin tardar en avisar.
const TELEGRAM_STALE_THRESHOLD_MS = 2 * 60 * 1000;

healthRouter.get("/", (_req, res) => {
  const telegram = getTelegramPollerHealth();
  const telegramStale =
    telegram.activeOrgCount > 0 &&
    (!telegram.lastPollSuccessAt || Date.now() - new Date(telegram.lastPollSuccessAt).getTime() > TELEGRAM_STALE_THRESHOLD_MS);

  // Otro proceso leyendo los mismos bots (409 de Telegram) duplica mensajes
  // y respuestas aunque el poll "funcione" a ratos — también es degradado,
  // y el motivo queda explícito en el body que muestra UptimeRobot.
  const telegramConflict = telegram.conflictOrgCount > 0;
  const degraded = telegramStale || telegramConflict;
  const reason = telegramConflict ? "telegram_poll_conflict_another_instance_running" : telegramStale ? "telegram_poller_stale" : undefined;

  res.status(degraded ? 503 : 200).json({
    status: degraded ? "degraded" : "ok",
    reason,
    version: env.RAILWAY_GIT_COMMIT_SHA ? env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7) : null,
    telegram,
    timestamp: new Date().toISOString()
  });
});

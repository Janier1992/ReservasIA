import { Router } from "express";
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

  const status = telegramStale ? "degraded" : "ok";
  res.status(telegramStale ? 503 : 200).json({ status, telegram, timestamp: new Date().toISOString() });
});

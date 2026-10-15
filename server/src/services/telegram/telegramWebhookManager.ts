import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { createScheduledJob } from "../../lib/scheduledJob.js";
import { getTelegramWebhookInfo, listConnectedTelegramBots, loadConnectedTelegramBotToken, setTelegramWebhook } from "./telegramService.js";

/**
 * Telegram por webhook: Telegram le envía cada mensaje al server (POST
 * /api/webhooks/telegram/:organizationId) en vez de que el server lo pida
 * con long-polling. Así varias instancias del server pueden atender en
 * paralelo sin leerse los mensajes entre ellas (con polling, dos
 * instancias = 409 y mensajes duplicados).
 *
 * Cada negocio tiene su propia URL y su propio secreto (derivado de
 * TELEGRAM_WEBHOOK_SECRET), así un bot no puede hacerse pasar por otro.
 */

const SYNC_INTERVAL_MS = 60_000;
// Cada tanto se revisa de nuevo en Telegram aunque el bot ya se haya
// registrado (por si alguien le cambió el webhook desde otra herramienta).
const FULL_RECHECK_MS = 30 * 60_000;
const TOKEN_CACHE_MS = 60_000;

export function isTelegramWebhookMode(): boolean {
  return env.TELEGRAM_MODE === "webhook" && !!env.TELEGRAM_WEBHOOK_BASE_URL && env.TELEGRAM_WEBHOOK_SECRET.length >= 16;
}

/** Secreto del header X-Telegram-Bot-Api-Secret-Token para este negocio. */
export function telegramWebhookSecretFor(organizationId: string, secret = env.TELEGRAM_WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(`telegram-webhook:${organizationId}`).digest("hex");
}

export function telegramWebhookUrlFor(organizationId: string, baseUrl = env.TELEGRAM_WEBHOOK_BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/webhooks/telegram/${organizationId}`;
}

export function isValidTelegramWebhookSecret(organizationId: string, received: string | undefined, secret = env.TELEGRAM_WEBHOOK_SECRET): boolean {
  if (!received || !secret) return false;
  const expected = Buffer.from(telegramWebhookSecretFor(organizationId, secret));
  const got = Buffer.from(received);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// Token por negocio, con caché corta: cada mensaje que llega lo necesita.
const tokenCache = new Map<string, { token: string | null; at: number }>();

export async function botTokenForWebhook(organizationId: string): Promise<string | null> {
  const cached = tokenCache.get(organizationId);
  if (cached && Date.now() - cached.at < TOKEN_CACHE_MS) return cached.token;
  const token = await loadConnectedTelegramBotToken(organizationId);
  tokenCache.set(organizationId, { token, at: Date.now() });
  return token;
}

// Bots ya registrados por esta instancia (org -> token), para no consultar
// a Telegram en cada vuelta.
const registered = new Map<string, string>();
let lastFullRecheck = 0;

/** Registra el webhook de cada bot conectado que todavía no lo tenga. */
export async function syncTelegramWebhooks(): Promise<{ registered: number; failed: number }> {
  if (Date.now() - lastFullRecheck > FULL_RECHECK_MS) {
    registered.clear();
    lastFullRecheck = Date.now();
  }
  const bots = await listConnectedTelegramBots();
  let added = 0;
  let failed = 0;
  for (const { organizationId, botToken } of bots) {
    if (registered.get(organizationId) === botToken) continue;
    const url = telegramWebhookUrlFor(organizationId);
    try {
      const info = await getTelegramWebhookInfo(botToken);
      if (info.url !== url) {
        await setTelegramWebhook(botToken, url, telegramWebhookSecretFor(organizationId));
        added++;
        logger.info({ organizationId }, "telegram_webhook_registered");
      }
      registered.set(organizationId, botToken);
      tokenCache.delete(organizationId);
    } catch (err) {
      failed++;
      logger.warn({ organizationId, err }, "telegram_webhook_register_failed");
    }
  }
  return { registered: added, failed };
}

// Una sola instancia registra webhooks por vuelta (ver lib/scheduledJob.ts).
const job = createScheduledJob("telegram_webhook_sync", SYNC_INTERVAL_MS, syncTelegramWebhooks);

export function startTelegramWebhookManager(): void {
  logger.info({ baseUrl: env.TELEGRAM_WEBHOOK_BASE_URL }, "telegram_webhook_mode");
  job.start();
}

export function stopTelegramWebhookManager(): void {
  job.stop();
}

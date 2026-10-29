import { logger } from "../../lib/logger.js";
import {
  deleteTelegramWebhook,
  getTelegramUpdates,
  listConnectedTelegramBots,
  TELEGRAM_POLL_CONFLICT
} from "./telegramService.js";
import { processUpdate } from "./telegramUpdateHandler.js";

// Los tests y otros módulos lo importaban desde acá.
export { processUpdate };

const REFRESH_INTERVAL_MS = 30_000;
const LONG_POLL_TIMEOUT_SECONDS = 25;
const ERROR_BACKOFF_MS = 5_000;

interface ActivePoller {
  controller: AbortController;
  botToken: string;
}

/**
 * Telegram no necesita un webhook con URL pública: cada organización que
 * conecta su bot se atiende con su propio loop de long-polling
 * (getUpdates). Esto permite correr el compute service detrás de NAT/
 * localhost sin pagar hosting con dominio público — a diferencia de
 * YCloud/Google, que sí lo necesitan para sus callbacks.
 *
 * Cada bot corre su propio loop independiente; un refresh periódico detecta
 * organizaciones que conectaron o desconectaron Telegram y arranca/para
 * los loops correspondientes.
 */
const activePollers = new Map<string, ActivePoller>();

// Cada `getTelegramUpdates` que resuelve (con o sin mensajes nuevos) prueba
// que el loop sigue vivo — se usa para que /api/health pueda distinguir
// "el proceso responde" de "el poller además sigue funcionando de verdad"
// (ver el bug de AbortSignal.any que dejó el poller trabado sin caerse el
// proceso).
let lastPollSuccessAt: number | null = null;

// Organizaciones cuyo último getUpdates devolvió 409 (otro proceso leyendo
// el mismo bot). Se limpia en cuanto un getUpdates de esa org vuelve a
// funcionar.
const conflictedOrgs = new Set<string>();

export function getTelegramPollerHealth(): {
  activeOrgCount: number;
  lastPollSuccessAt: string | null;
  conflictOrgCount: number;
} {
  return {
    activeOrgCount: activePollers.size,
    lastPollSuccessAt: lastPollSuccessAt ? new Date(lastPollSuccessAt).toISOString() : null,
    conflictOrgCount: conflictedOrgs.size
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    // El listener se quita al terminar la espera: si no, cada reintento deja
    // uno colgado en el signal del poller (MaxListenersExceededWarning).
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runPollLoop(organizationId: string, botToken: string, signal: AbortSignal): Promise<void> {
  let offset = 0;
  logger.info({ organizationId }, "telegram_poller_started");

  // Si el bot quedó con webhook (se usó el modo webhook antes), getUpdates
  // respondería 409 para siempre: se quita sin perder los mensajes pendientes.
  try {
    await deleteTelegramWebhook(botToken);
  } catch (err) {
    logger.warn({ organizationId, err }, "telegram_delete_webhook_failed");
  }

  while (!signal.aborted) {
    try {
      const updates = await getTelegramUpdates(botToken, offset, LONG_POLL_TIMEOUT_SECONDS, signal);
      lastPollSuccessAt = Date.now();
      conflictedOrgs.delete(organizationId);

      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await processUpdate(organizationId, botToken, update);
        } catch (err) {
          logger.error({ organizationId, updateId: update.update_id, err }, "telegram_update_processing_failed");
        }
      }
    } catch (err) {
      // Solo se corta si se pidió parar este poller. Un AbortError sin eso es
      // el timeout propio de getUpdates (red caída o lenta): se reintenta, si
      // no el bot quedaba sin leer para siempre tras un corte de red.
      if (signal.aborted) break;
      if ((err as { code?: string }).code === TELEGRAM_POLL_CONFLICT) {
        conflictedOrgs.add(organizationId);
        logger.error(
          { organizationId },
          "telegram_poll_conflict_another_instance_running: otro proceso (¿server local con credenciales de producción?) está leyendo este bot"
        );
      } else {
        logger.warn({ organizationId, err }, "telegram_get_updates_failed");
      }
      await sleep(ERROR_BACKOFF_MS, signal);
    }
  }

  logger.info({ organizationId }, "telegram_poller_stopped");
}

async function refreshPollers(): Promise<void> {
  let connectedBots;
  try {
    connectedBots = await listConnectedTelegramBots();
  } catch (err) {
    logger.error({ err }, "telegram_refresh_pollers_failed");
    return;
  }

  const connectedByOrg = new Map(connectedBots.map((bot) => [bot.organizationId, bot.botToken]));

  for (const [organizationId, poller] of activePollers) {
    const stillConnectedToken = connectedByOrg.get(organizationId);
    if (!stillConnectedToken || stillConnectedToken !== poller.botToken) {
      poller.controller.abort();
      activePollers.delete(organizationId);
      conflictedOrgs.delete(organizationId);
    }
  }

  for (const [organizationId, botToken] of connectedByOrg) {
    if (activePollers.has(organizationId)) continue;
    const controller = new AbortController();
    activePollers.set(organizationId, { controller, botToken });
    // Línea de base optimista: recién arrancado, todavía no tuvo tiempo de
    // completar su primer getUpdates (hasta LONG_POLL_TIMEOUT_SECONDS) —
    // sin esto, /api/health marcaría "degraded" por unos segundos en cada
    // arranque/redeploy.
    lastPollSuccessAt = Date.now();
    runPollLoop(organizationId, botToken, controller.signal)
      .catch((err) => logger.error({ organizationId, err }, "telegram_poll_loop_crashed"))
      .finally(() => {
        // Si el loop terminó sin que nadie lo parara, el próximo refresh lo
        // vuelve a arrancar (no queda registrado como activo sin estarlo).
        if (activePollers.get(organizationId)?.controller === controller) activePollers.delete(organizationId);
      });
  }
}

let refreshTimer: NodeJS.Timeout | null = null;

export function startTelegramPollingManager(): void {
  refreshPollers();
  refreshTimer = setInterval(refreshPollers, REFRESH_INTERVAL_MS);
}

export function stopTelegramPollingManager(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  for (const poller of activePollers.values()) poller.controller.abort();
  activePollers.clear();
}

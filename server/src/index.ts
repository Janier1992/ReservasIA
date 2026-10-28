import { createApp } from "./app.js";
import { DEFAULT_OAUTH_STATE_SECRET, env, isDeployed } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startTelegramPollingManager, stopTelegramPollingManager } from "./services/telegram/telegramPollingManager.js";
import {
  isTelegramWebhookMode,
  startTelegramWebhookManager,
  stopTelegramWebhookManager
} from "./services/telegram/telegramWebhookManager.js";
import { startReminderScheduler, stopReminderScheduler } from "./services/reminders/reminderScheduler.js";
import { startSurveyScheduler, stopSurveyScheduler } from "./services/surveys/surveyScheduler.js";
import { startOrderReadyNotifier, stopOrderReadyNotifier } from "./services/publicOrders/orderReadyNotifier.js";
import { startSubscriptionScheduler, stopSubscriptionScheduler } from "./services/subscription/subscriptionScheduler.js";
import {
  startInboundClaimsCleanupScheduler,
  stopInboundClaimsCleanupScheduler
} from "./services/conversations/inboundClaimsCleanupScheduler.js";
import { startReservationSyncScheduler, stopReservationSyncScheduler } from "./services/reservations/reservationSyncScheduler.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "server_started");
  // No se tumba el arranque (los bots y las reservas siguen funcionando): solo
  // la conexión con Google queda rechazada hasta configurar el secreto.
  if (isDeployed() && env.OAUTH_STATE_SECRET === DEFAULT_OAUTH_STATE_SECRET) {
    logger.error("oauth_state_secret_is_default: configurá OAUTH_STATE_SECRET (el mismo valor en Railway y en InsForge)");
  }
  if (env.DISABLE_BACKGROUND_WORKERS) {
    logger.warn("background_workers_disabled: sin poller de Telegram ni schedulers (DISABLE_BACKGROUND_WORKERS=true)");
    return;
  }
  // Webhook: varias instancias pueden atender Telegram a la vez. Polling: una sola.
  if (isTelegramWebhookMode()) {
    startTelegramWebhookManager();
  } else {
    if (env.TELEGRAM_MODE === "webhook") {
      logger.error("telegram_webhook_misconfigured: faltan TELEGRAM_WEBHOOK_BASE_URL o TELEGRAM_WEBHOOK_SECRET (16+ caracteres); sigue en polling");
    }
    startTelegramPollingManager();
  }
  startReminderScheduler();
  startSurveyScheduler();
  startOrderReadyNotifier();
  startSubscriptionScheduler();
  startInboundClaimsCleanupScheduler();
  startReservationSyncScheduler();
});

function shutdown() {
  if (!env.DISABLE_BACKGROUND_WORKERS) {
    stopTelegramPollingManager();
    stopTelegramWebhookManager();
    stopReminderScheduler();
    stopSurveyScheduler();
    stopOrderReadyNotifier();
    stopSubscriptionScheduler();
    stopInboundClaimsCleanupScheduler();
    stopReservationSyncScheduler();
  }
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

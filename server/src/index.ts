import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startTelegramPollingManager, stopTelegramPollingManager } from "./services/telegram/telegramPollingManager.js";
import { startReminderScheduler, stopReminderScheduler } from "./services/reminders/reminderScheduler.js";
import { startSubscriptionScheduler, stopSubscriptionScheduler } from "./services/subscription/subscriptionScheduler.js";
import {
  startInboundClaimsCleanupScheduler,
  stopInboundClaimsCleanupScheduler
} from "./services/conversations/inboundClaimsCleanupScheduler.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "server_started");
  if (env.DISABLE_BACKGROUND_WORKERS) {
    logger.warn("background_workers_disabled: sin poller de Telegram ni schedulers (DISABLE_BACKGROUND_WORKERS=true)");
    return;
  }
  startTelegramPollingManager();
  startReminderScheduler();
  startSubscriptionScheduler();
  startInboundClaimsCleanupScheduler();
});

function shutdown() {
  if (!env.DISABLE_BACKGROUND_WORKERS) {
    stopTelegramPollingManager();
    stopReminderScheduler();
    stopSubscriptionScheduler();
    stopInboundClaimsCleanupScheduler();
  }
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

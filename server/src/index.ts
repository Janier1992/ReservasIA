import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startTelegramPollingManager, stopTelegramPollingManager } from "./services/telegram/telegramPollingManager.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "server_started");
  startTelegramPollingManager();
});

function shutdown() {
  stopTelegramPollingManager();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

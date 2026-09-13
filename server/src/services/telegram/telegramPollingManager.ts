import { logger } from "../../lib/logger.js";
import { handleInboundMessage } from "../conversations/inboundMessageHandler.js";
import { runAgentTurn } from "../agent/agentRuntime.js";
import { getTelegramUpdates, listConnectedTelegramBots, sendTelegramMessage, type TelegramUpdate } from "./telegramService.js";

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
 * Twilio/Google, que sí lo necesitan para sus callbacks.
 *
 * Cada bot corre su propio loop independiente; un refresh periódico detecta
 * organizaciones que conectaron o desconectaron Telegram y arranca/para
 * los loops correspondientes.
 */
const activePollers = new Map<string, ActivePoller>();

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function processUpdate(organizationId: string, botToken: string, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.chat?.id) return;

  const chatId = message.chat.id;
  const externalIdentity = `telegram:${chatId}`;

  const { conversationId, customerId } = await handleInboundMessage({
    organizationId,
    channel: "telegram",
    externalIdentity,
    externalConversationId: String(chatId),
    content: message.text,
    externalMessageId: String(message.message_id)
  });

  const result = await runAgentTurn({
    organizationId,
    conversationId,
    customerId,
    customerPhone: externalIdentity,
    requestId: `telegram:${update.update_id}`
  });

  if (result.reply) {
    await sendTelegramMessage(botToken, chatId, result.reply);
  }
}

async function runPollLoop(organizationId: string, botToken: string, signal: AbortSignal): Promise<void> {
  let offset = 0;
  logger.info({ organizationId }, "telegram_poller_started");

  while (!signal.aborted) {
    try {
      const updates = await getTelegramUpdates(botToken, offset, LONG_POLL_TIMEOUT_SECONDS, signal);

      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await processUpdate(organizationId, botToken, update);
        } catch (err) {
          logger.error({ organizationId, updateId: update.update_id, err }, "telegram_update_processing_failed");
        }
      }
    } catch (err) {
      if (signal.aborted || (err as { name?: string }).name === "AbortError") break;
      logger.warn({ organizationId, err }, "telegram_get_updates_failed");
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
    }
  }

  for (const [organizationId, botToken] of connectedByOrg) {
    if (activePollers.has(organizationId)) continue;
    const controller = new AbortController();
    activePollers.set(organizationId, { controller, botToken });
    runPollLoop(organizationId, botToken, controller.signal).catch((err) => {
      logger.error({ organizationId, err }, "telegram_poll_loop_crashed");
      activePollers.delete(organizationId);
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

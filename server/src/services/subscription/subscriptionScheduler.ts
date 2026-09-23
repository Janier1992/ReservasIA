import { logger } from "../../lib/logger.js";
import { suspendExpiredSubscriptions } from "./subscriptionService.js";

// El vencimiento de una suscripción no es tan sensible al minuto como un
// recordatorio de turno — revisarlo una vez por hora alcanza de sobra.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

async function runOnce(): Promise<void> {
  try {
    await suspendExpiredSubscriptions();
  } catch (err) {
    logger.error({ err }, "subscription_expiry_run_failed");
  }
}

export function startSubscriptionScheduler(): void {
  runOnce();
  timer = setInterval(runOnce, CHECK_INTERVAL_MS);
}

export function stopSubscriptionScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

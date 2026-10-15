import { createScheduledJob } from "../../lib/scheduledJob.js";
import { suspendExpiredSubscriptions } from "./subscriptionService.js";

// El vencimiento de una suscripción no es tan sensible al minuto como un
// recordatorio de turno — revisarlo una vez por hora alcanza de sobra.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Con varias instancias del server, cada vuelta corre en una sola (ver lib/scheduledJob.ts).
const job = createScheduledJob("subscription_expiry", CHECK_INTERVAL_MS, suspendExpiredSubscriptions);

export function startSubscriptionScheduler(): void {
  job.start();
}

export function stopSubscriptionScheduler(): void {
  job.stop();
}

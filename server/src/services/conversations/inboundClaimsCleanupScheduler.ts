import { createScheduledJob } from "../../lib/scheduledJob.js";
import { purgeOldInboundMessageClaims } from "./inboundMessageHandler.js";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas: la retención es de días, no hace falta más seguido.

// Con varias instancias del server, cada vuelta corre en una sola (ver lib/scheduledJob.ts).
const job = createScheduledJob("inbound_claims_cleanup", CLEANUP_INTERVAL_MS, purgeOldInboundMessageClaims);

export function startInboundClaimsCleanupScheduler(): void {
  job.start();
}

export function stopInboundClaimsCleanupScheduler(): void {
  job.stop();
}

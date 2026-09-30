import { logger } from "../../lib/logger.js";
import { purgeOldInboundMessageClaims } from "./inboundMessageHandler.js";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas: la retención es de días, no hace falta más seguido.

let timer: NodeJS.Timeout | null = null;

async function runOnce(): Promise<void> {
  try {
    await purgeOldInboundMessageClaims();
  } catch (err) {
    logger.error({ err }, "inbound_claims_cleanup_failed");
  }
}

export function startInboundClaimsCleanupScheduler(): void {
  runOnce();
  timer = setInterval(runOnce, CLEANUP_INTERVAL_MS);
}

export function stopInboundClaimsCleanupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

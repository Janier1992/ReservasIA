import { logger } from "../../lib/logger.js";
import { sendDueReservationReminders } from "./reminderService.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos: suficiente margen frente a una ventana mínima de 1 hora antes.

let timer: NodeJS.Timeout | null = null;

async function runOnce(): Promise<void> {
  try {
    await sendDueReservationReminders();
  } catch (err) {
    logger.error({ err }, "reservation_reminders_run_failed");
  }
}

export function startReminderScheduler(): void {
  runOnce();
  timer = setInterval(runOnce, CHECK_INTERVAL_MS);
}

export function stopReminderScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

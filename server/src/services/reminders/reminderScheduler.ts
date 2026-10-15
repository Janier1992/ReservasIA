import { createScheduledJob } from "../../lib/scheduledJob.js";
import { sendDueReservationReminders } from "./reminderService.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos: suficiente margen frente a una ventana mínima de 1 hora antes.

// Con varias instancias del server, cada vuelta corre en una sola (ver lib/scheduledJob.ts).
const job = createScheduledJob("reminders", CHECK_INTERVAL_MS, sendDueReservationReminders);

export function startReminderScheduler(): void {
  job.start();
}

export function stopReminderScheduler(): void {
  job.stop();
}

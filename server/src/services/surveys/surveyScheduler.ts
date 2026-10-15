import { createScheduledJob } from "../../lib/scheduledJob.js";
import { sendDueSurveys } from "./surveyService.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Con varias instancias del server, cada vuelta corre en una sola (ver lib/scheduledJob.ts).
const job = createScheduledJob("surveys", CHECK_INTERVAL_MS, sendDueSurveys);

export function startSurveyScheduler(): void {
  job.start();
}

export function stopSurveyScheduler(): void {
  job.stop();
}

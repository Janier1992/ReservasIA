import { logger } from "../../lib/logger.js";
import { sendDueSurveys } from "./surveyService.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

async function runOnce(): Promise<void> {
  try {
    await sendDueSurveys();
  } catch (err) {
    logger.error({ err }, "survey_run_failed");
  }
}

export function startSurveyScheduler(): void {
  runOnce();
  timer = setInterval(runOnce, CHECK_INTERVAL_MS);
}

export function stopSurveyScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

import { env } from "../config/env.js";
import { insforgeAdmin } from "./insforge.js";
import { logger } from "./logger.js";

/**
 * Aviso por correo cuando algo empieza a fallar seguido, para enterarse
 * antes de que lo cuenten los negocios. Un error suelto no avisa (una red
 * que parpadea, un mensaje raro): avisa cuando el mismo tipo de falla se
 * repite ALERT_THRESHOLD veces en ALERT_WINDOW_MS, y como mucho una vez por
 * ALERT_COOLDOWN_MS por tipo, para no llenar la bandeja.
 *
 * El correo va a ALERT_EMAIL (Railway). Sin esa variable solo queda el log
 * `alert_triggered`. Nunca incluye datos de clientes: solo el tipo de falla,
 * cuántas veces pasó y el mensaje técnico del último error, recortado.
 * Vive en memoria del server (una sola instancia, como hoy).
 */

export const ALERT_THRESHOLD = 5;
export const ALERT_WINDOW_MS = 10 * 60 * 1000;
export const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/** Qué se rompió, en palabras para el correo. */
const ALERT_LABELS: Record<string, string> = {
  agent_ai: "El agente no pudo consultar a la IA (OpenRouter/OpenAI)",
  channel_message: "Mensajes de WhatsApp o Telegram que no se pudieron procesar",
  server_error: "Errores inesperados del servidor (respuestas 500)",
  reservation_email: "No salen los correos de confirmación de reservas (InsForge)",
  google_calendar: "No se pueden crear o actualizar eventos en Google Calendar",
  agent_unverified_reply: "El agente intentó dar horarios, días o precios que no coinciden con los datos del negocio (se envió una respuesta segura): revisá la configuración del negocio",
  google_connection_expired: "Venció la conexión de un negocio con Google Calendar: tiene que reconectarla en Integraciones"
};

const failures = new Map<string, number[]>();
const lastAlertAt = new Map<string, number>();

function alertLabel(kind: string): string {
  if (kind.startsWith("scheduled_job:")) return `Falla la tarea programada "${kind.slice("scheduled_job:".length)}"`;
  return ALERT_LABELS[kind] ?? kind;
}

/** Solo el mensaje del error, recortado: nunca el objeto entero (podría traer datos de un cliente). */
function errorSummary(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Error sin mensaje";
  return message.replace(/\s+/g, " ").slice(0, 200);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendAlertEmail(kind: string, count: number, lastError: string): Promise<void> {
  const recipients = env.ALERT_EMAIL.split(",").map((email) => email.trim()).filter(Boolean);
  if (recipients.length === 0) return;
  const label = alertLabel(kind);
  const html = `<p><strong>${escapeHtml(label)}</strong></p>
<p>${count === 1 ? "Pasó recién." : `Pasó ${count} veces en los últimos ${ALERT_WINDOW_MS / 60_000} minutos.`}</p>
<p>Último error: <code>${escapeHtml(lastError)}</code></p>
<p>Revisá los logs del compute service en Railway (buscá el tipo <code>${escapeHtml(kind)}</code>). Si sigue fallando, no vas a recibir otro aviso de este tipo durante la próxima hora.</p>`;
  const { error } = await insforgeAdmin.emails.send({ to: recipients, subject: `[ReservasIA] Alerta: ${label}`, html });
  if (error) logger.warn({ kind, err: error }, "alert_email_failed");
}

/**
 * Cuenta una falla del tipo `kind` y, si ya van ALERT_THRESHOLD en la
 * ventana, avisa. Nunca lanza: una alerta que falla no puede romper el
 * flujo que la llamó.
 */
export function reportFailure(kind: string, err: unknown, now: number = Date.now(), threshold: number = ALERT_THRESHOLD): void {
  try {
    const recent = (failures.get(kind) ?? []).filter((t) => now - t < ALERT_WINDOW_MS);
    recent.push(now);
    failures.set(kind, recent);
    if (recent.length < threshold) return;

    const last = lastAlertAt.get(kind);
    if (last !== undefined && now - last < ALERT_COOLDOWN_MS) return;
    lastAlertAt.set(kind, now);

    const lastError = errorSummary(err);
    logger.error({ kind, count: recent.length, lastError }, "alert_triggered");
    void sendAlertEmail(kind, recent.length, lastError).catch((sendErr) => logger.warn({ kind, err: sendErr }, "alert_email_failed"));
  } catch (alertErr) {
    logger.warn({ kind, err: alertErr }, "alert_report_failed");
  }
}

/**
 * Falla que no se arregla sola y que no se va a repetir (porque el sistema
 * deja de intentar): avisa a la primera, con la misma pausa de una hora.
 */
export function reportCriticalFailure(kind: string, err: unknown, now: number = Date.now()): void {
  reportFailure(kind, err, now, 1);
}

/** Solo para pruebas. */
export function resetAlerts(): void {
  failures.clear();
  lastAlertAt.clear();
}

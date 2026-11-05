import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { claimSentMessage, normalizeWhatsAppPhone, SEND_TIMEOUT_MS, YCLOUD_API_BASE, type YCloudIntegration } from "./ycloudService.js";

/**
 * Recordatorio de reserva por WhatsApp con YCloud. Meta solo deja escribirle
 * primero a un cliente con una plantilla aprobada, así que el recordatorio
 * nunca sale como texto libre.
 *
 * La plantilla se crea sola en la cuenta de YCloud del negocio la primera vez
 * que hace falta (así sirve también para los negocios que conectaron antes).
 * Meta la revisa, normalmente en minutos u horas: mientras no esté aprobada
 * el recordatorio se salta y se vuelve a intentar en la siguiente vuelta.
 * El estado se guarda en integrations.metadata.reminder_template para no
 * preguntarle a YCloud en cada recordatorio.
 */

export const REMINDER_TEMPLATE_NAME = "reservasia_recordatorio_reserva";
export const REMINDER_TEMPLATE_LANGUAGE = "es";
/** Variables: {{1}} nombre del cliente, {{2}} negocio, {{3}} fecha y hora. */
export const REMINDER_TEMPLATE_BODY =
  "Hola {{1}}, te recordamos tu reserva en {{2}} el {{3}}. Si necesitás cambiarla o cancelarla, respondé a este mensaje.";
const REMINDER_TEMPLATE_EXAMPLE = ["Laura", "Barbería El Corte", "viernes 14 de noviembre a las 15:00"];

/** Cada cuánto se vuelve a preguntar si Meta ya aprobó una plantilla pendiente. */
const STATUS_RECHECK_MS = 30 * 60 * 1000;

interface ReminderTemplateRecord {
  status: string;
  checked_at: string;
  /** Motivo del rechazo de Meta, si lo hubo (para mostrarlo en los logs). */
  reason?: string | null;
}

interface YCloudTemplate {
  status?: string;
  reason?: string | null;
}

function ycloudRequest(integration: YCloudIntegration, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${YCLOUD_API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-API-Key": integration.credentials.api_key },
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
  });
}

async function fetchTemplate(integration: YCloudIntegration, wabaId: string): Promise<YCloudTemplate | null> {
  const path = `/whatsapp/templates/${encodeURIComponent(wabaId)}/${REMINDER_TEMPLATE_NAME}/${REMINDER_TEMPLATE_LANGUAGE}`;
  const res = await ycloudRequest(integration, path);
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as YCloudTemplate | null;
}

/** Crea la plantilla; si ya existía en la cuenta (por ejemplo, al reconectar), devuelve la que hay. */
async function createTemplate(integration: YCloudIntegration, wabaId: string): Promise<YCloudTemplate | null> {
  const res = await ycloudRequest(integration, "/whatsapp/templates", {
    method: "POST",
    body: JSON.stringify({
      wabaId,
      name: REMINDER_TEMPLATE_NAME,
      language: REMINDER_TEMPLATE_LANGUAGE,
      category: "UTILITY",
      components: [{ type: "BODY", text: REMINDER_TEMPLATE_BODY, example: { body_text: [REMINDER_TEMPLATE_EXAMPLE] } }]
    })
  });
  if (res.ok) return (await res.json().catch(() => ({ status: "PENDING" }))) as YCloudTemplate;
  const existing = await fetchTemplate(integration, wabaId);
  if (!existing) {
    const detail = await res.text().catch(() => "");
    logger.warn({ organizationId: integration.organizationId, status: res.status, detail: detail.slice(0, 300) }, "ycloud_reminder_template_create_failed");
  }
  return existing;
}

async function saveTemplateRecord(integration: YCloudIntegration, record: ReminderTemplateRecord): Promise<void> {
  const { error } = await insforgeAdmin.database
    .from("integrations")
    .update({ metadata: { ...integration.metadata, reminder_template: record } })
    .eq("organization_id", integration.organizationId)
    .eq("provider", "ycloud");
  if (error) logger.warn({ organizationId: integration.organizationId, err: error }, "ycloud_reminder_template_save_failed");
}

/**
 * Estado de la plantilla de recordatorio del negocio, creándola si todavía
 * no existe. Solo consulta a YCloud cuando no hay estado guardado o cuando
 * una pendiente ya lleva un rato sin revisarse.
 */
export async function ensureReminderTemplate(integration: YCloudIntegration, now: Date = new Date()): Promise<string | null> {
  const wabaId = typeof integration.metadata.waba_id === "string" ? integration.metadata.waba_id : null;
  if (!wabaId) {
    logger.warn({ organizationId: integration.organizationId }, "ycloud_reminder_template_missing_waba_id");
    return null;
  }

  const saved = integration.metadata.reminder_template as ReminderTemplateRecord | undefined;
  if (saved?.status === "APPROVED") return saved.status;
  if (saved && now.getTime() - new Date(saved.checked_at).getTime() < STATUS_RECHECK_MS) return saved.status;

  const template = saved ? await fetchTemplate(integration, wabaId) : await createTemplate(integration, wabaId);
  if (!template?.status) return saved?.status ?? null;

  if (template.status === "REJECTED") {
    logger.warn({ organizationId: integration.organizationId, reason: template.reason ?? null }, "ycloud_reminder_template_rejected");
  }
  await saveTemplateRecord(integration, { status: template.status, checked_at: now.toISOString(), reason: template.reason ?? null });
  return template.status;
}

/**
 * Manda el recordatorio con la plantilla. "no_template_configured" si la
 * plantilla todavía no está aprobada (el llamador lo reintenta más tarde).
 */
export async function sendYCloudReminderTemplate(
  integration: YCloudIntegration,
  toPhone: string,
  variables: Record<string, string>,
  now: Date = new Date()
): Promise<"sent" | "no_template_configured"> {
  if ((await ensureReminderTemplate(integration, now)) !== "APPROVED") return "no_template_configured";

  const to = normalizeWhatsAppPhone(toPhone);
  const parameters = ["1", "2", "3"].map((key) => ({ type: "text", text: variables[key] ?? "" }));
  const res = await ycloudRequest(integration, "/whatsapp/messages/sendDirectly", {
    method: "POST",
    body: JSON.stringify({
      from: integration.phoneNumber,
      to,
      type: "template",
      template: {
        name: REMINDER_TEMPLATE_NAME,
        language: { code: REMINDER_TEMPLATE_LANGUAGE },
        components: [{ type: "body", parameters }]
      }
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`YCloud respondió ${res.status} al enviar el recordatorio: ${detail.slice(0, 300)}`);
  }
  const message = (await res.json().catch(() => null)) as { id?: string; wamid?: string; status?: string; errorCode?: string; errorMessage?: string } | null;
  if (message?.status === "failed") {
    throw new Error(`WhatsApp rechazó el recordatorio (${message.errorCode ?? "sin código"}): ${message.errorMessage ?? ""}`);
  }
  await claimSentMessage(integration.organizationId, to, [message?.wamid, message?.id]);
  return "sent";
}

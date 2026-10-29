import { sendTwilioWhatsAppMessage, sendTwilioWhatsAppReminderTemplate } from "../twilio/twilioService.js";
import { loadYCloudIntegration, sendYCloudText } from "../ycloud/ycloudService.js";
import { sendYCloudReminderTemplate } from "../ycloud/ycloudReminderTemplate.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";

/**
 * Un negocio atiende WhatsApp por YCloud (su propio número, coexistiendo con
 * la app de WhatsApp Business) o por Twilio. Si tiene YCloud conectado se usa
 * ese; si no, Twilio (que falla con INTEGRATION_NOT_CONNECTED si tampoco está).
 */
export async function sendWhatsAppMessage(organizationId: string, toPhone: string, body: string): Promise<void> {
  const ycloud = await loadYCloudIntegration(organizationId);
  if (ycloud) {
    await sendYCloudText(ycloud, toPhone, body);
    return;
  }
  await sendTwilioWhatsAppMessage(organizationId, toPhone, body);
}

/**
 * Recordatorio por plantilla aprobada (nunca texto libre), por YCloud si el
 * negocio lo tiene conectado o por Twilio si no. "no_template_configured"
 * mientras la plantilla no esté aprobada: se salta y se reintenta después.
 * "no_whatsapp_channel" si el negocio no tiene WhatsApp conectado (por
 * ejemplo, atiende solo por Telegram y el cliente dejó su número).
 */
export async function sendWhatsAppReminderTemplate(
  organizationId: string,
  toPhone: string,
  variables: Record<string, string>
): Promise<"sent" | "no_template_configured" | "no_whatsapp_channel"> {
  const ycloud = await loadYCloudIntegration(organizationId);
  if (ycloud) return sendYCloudReminderTemplate(ycloud, toPhone, variables);
  try {
    return await sendTwilioWhatsAppReminderTemplate(organizationId, toPhone, variables);
  } catch (err) {
    if (err instanceof AppError && err.code === ErrorCodes.INTEGRATION_NOT_CONNECTED) return "no_whatsapp_channel";
    throw err;
  }
}

import { loadYCloudIntegration, sendYCloudText } from "../ycloud/ycloudService.js";
import { sendYCloudReminderTemplate } from "../ycloud/ycloudReminderTemplate.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";

/** Un negocio atiende WhatsApp conectando su propio número por YCloud (coexistencia con la app de WhatsApp Business). */
export async function sendWhatsAppMessage(organizationId: string, toPhone: string, body: string): Promise<void> {
  const ycloud = await loadYCloudIntegration(organizationId);
  if (!ycloud) {
    throw new AppError(ErrorCodes.INTEGRATION_NOT_CONNECTED, "WhatsApp no está conectado para esta organización.", 409);
  }
  await sendYCloudText(ycloud, toPhone, body);
}

/**
 * Recordatorio por plantilla aprobada (nunca texto libre). "no_template_configured"
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
  if (!ycloud) return "no_whatsapp_channel";
  return sendYCloudReminderTemplate(ycloud, toPhone, variables);
}

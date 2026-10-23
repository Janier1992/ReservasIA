import { sendTwilioWhatsAppMessage, sendTwilioWhatsAppReminderTemplate } from "../twilio/twilioService.js";
import { loadYCloudIntegration, sendYCloudText } from "../ycloud/ycloudService.js";

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
 * Recordatorio por plantilla aprobada. Con YCloud todavía no hay plantillas
 * configuradas (llegan en la etapa 2), así que se informa igual que un
 * negocio de Twilio sin plantilla: se salta, nunca se cae a texto libre.
 */
export async function sendWhatsAppReminderTemplate(
  organizationId: string,
  toPhone: string,
  variables: Record<string, string>
): Promise<"sent" | "no_template_configured"> {
  if (await loadYCloudIntegration(organizationId)) return "no_template_configured";
  return sendTwilioWhatsAppReminderTemplate(organizationId, toPhone, variables);
}

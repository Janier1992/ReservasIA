import { formatInTimeZone } from "date-fns-tz";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { sendTelegramMessage } from "../telegram/telegramService.js";
import { sendWhatsAppReminderTemplate } from "../twilio/twilioService.js";

const TELEGRAM_PHONE_PREFIX = "telegram:";

interface DueReminderRow {
  reservation_id: string;
  organization_id: string;
  customer_id: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  service_name: string | null;
  start_at: string;
  timezone: string;
  business_name: string;
}

async function loadTelegramBotToken(organizationId: string): Promise<string | null> {
  const { data } = await insforgeAdmin.database
    .from("integrations")
    .select("credentials")
    .eq("organization_id", organizationId)
    .eq("provider", "telegram")
    .eq("status", "connected")
    .maybeSingle();
  return (data?.credentials as { bot_token?: string } | null)?.bot_token ?? null;
}

function formatReminderWhen(row: DueReminderRow): string {
  return formatInTimeZone(new Date(row.start_at), row.timezone, "EEEE d 'de' MMMM 'a las' HH:mm");
}

export function buildReminderText(row: DueReminderRow): string {
  const when = formatReminderWhen(row);
  const greeting = row.customer_name ? `¡Hola ${row.customer_name}!` : "¡Hola!";
  const serviceText = row.service_name ? ` para ${row.service_name}` : "";
  return `${greeting} Te recordamos tu reserva${serviceText} en ${row.business_name}, el ${when}. Si necesitás cambiarla o cancelarla, escribinos por acá.`;
}

/**
 * El mismo `customers.phone` que identifica al cliente en el resto del
 * sistema ya nos dice por qué canal escribirle: `telegram:<chat_id>` para
 * Telegram, o el número real para WhatsApp — no hace falta guardar el
 * canal aparte en ningún lado.
 *
 * WhatsApp SIEMPRE se manda por plantilla pre-aprobada, nunca como texto
 * libre: una reserva hecha con anticipación casi siempre cae fuera de la
 * ventana de 24h en la que Meta permite texto libre, así que un mensaje
 * libre se rechazaría. La plantilla se crea y somete a aprobación sola al
 * conectar WhatsApp (ver functions/twilio-connect.ts); si todavía no está
 * configurada (o Meta no la aprobó), el recordatorio de esa reserva se
 * salta y se reintenta en el siguiente ciclo — nunca se cae a texto libre.
 */
async function sendReminder(row: DueReminderRow): Promise<boolean> {
  if (!row.customer_phone) return false;

  try {
    if (row.customer_phone.startsWith(TELEGRAM_PHONE_PREFIX)) {
      const chatId = row.customer_phone.slice(TELEGRAM_PHONE_PREFIX.length);
      const botToken = await loadTelegramBotToken(row.organization_id);
      if (!botToken) {
        logger.warn({ reservationId: row.reservation_id, organizationId: row.organization_id }, "reminder_skipped_no_telegram_bot");
        return false;
      }
      await sendTelegramMessage(botToken, chatId, buildReminderText(row));
      return true;
    }

    const result = await sendWhatsAppReminderTemplate(row.organization_id, row.customer_phone, {
      "1": row.customer_name ?? "cliente",
      "2": row.business_name,
      "3": formatReminderWhen(row)
    });
    if (result === "no_template_configured") {
      logger.warn({ reservationId: row.reservation_id, organizationId: row.organization_id }, "reminder_skipped_no_whatsapp_template");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ reservationId: row.reservation_id, organizationId: row.organization_id, err }, "reminder_send_failed");
    return false;
  }
}

/**
 * Corre periódicamente desde reminderScheduler. Cada reserva se procesa de
 * forma independiente: si una falla (bot desconectado, Telegram caído,
 * etc.) no debe impedir que se manden las demás, y nunca vuelve a
 * reintentar una que ya se marcó como enviada aunque el mensaje en sí haya
 * fallado en un envío posterior — se prioriza "nunca duplicar" sobre
 * "garantizar entrega", igual que cualquier recordatorio best-effort.
 */
export async function sendDueReservationReminders(): Promise<{ total: number; sent: number }> {
  const { data, error } = await insforgeAdmin.database.rpc("get_due_reservation_reminders");
  if (error) {
    logger.warn({ err: error }, "reservation_reminders_query_failed");
    return { total: 0, sent: 0 };
  }

  const rows = (data ?? []) as DueReminderRow[];
  if (rows.length === 0) return { total: 0, sent: 0 };

  let sent = 0;
  for (const row of rows) {
    const ok = await sendReminder(row);
    if (ok) {
      await insforgeAdmin.database
        .from("reservations")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", row.reservation_id);
      sent++;
    }
  }

  logger.info({ total: rows.length, sent }, "reservation_reminders_batch_done");
  return { total: rows.length, sent };
}

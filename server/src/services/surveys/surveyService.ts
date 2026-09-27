import { env } from "../../config/env.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { sendTelegramMessage } from "../telegram/telegramService.js";
import { sendWhatsAppMessage } from "../twilio/twilioService.js";

const TELEGRAM_PREFIX = "telegram:";
/** Se pide la opinión entre 2 y 48 horas después de terminada la atención. */
const MIN_DELAY_MS = 2 * 60 * 60 * 1000;
const MAX_DELAY_MS = 48 * 60 * 60 * 1000;
/** Meta solo permite texto libre por WhatsApp dentro de las 24h del último mensaje del cliente. */
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 200;

interface CompletedRow {
  id: string;
  organization_id: string;
  customer_id: string;
  conversation_id: string | null;
  customer_name: string | null;
  customers: { name: string | null; phone: string | null } | null;
}

export interface SurveyCandidate {
  reservationId: string;
  organizationId: string;
  customerId: string;
  customerName: string | null;
  phone: string;
  conversationId: string | null;
  businessName: string;
  channel: "telegram" | "whatsapp";
}

export function buildSurveyText(customerName: string | null, businessName: string, url: string): string {
  const first = (customerName ?? "").trim().split(/\s+/)[0];
  return `${first ? `Hola ${first}` : "Hola"}, gracias por visitarnos en ${businessName}. ¿Nos contás cómo te fue? Son 10 segundos: ${url}`;
}

export function surveyLink(token: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/o/${token}`;
}

/**
 * Atenciones completadas hace 2-48h, de negocios con Opiniones activo y el
 * envío automático encendido, sin encuesta todavía, y con un canal por el
 * que se pueda escribir: Telegram siempre; WhatsApp solo si el cliente
 * escribió en las últimas 24h (fuera de esa ventana Meta rechaza texto
 * libre, y esas quedan para pedirlas a mano desde el panel).
 */
export async function findSurveyCandidates(now = new Date()): Promise<SurveyCandidate[]> {
  const { data: completed, error } = await insforgeAdmin.database
    .from("reservations")
    .select("id, organization_id, customer_id, conversation_id, customer_name, customers(name, phone)")
    .eq("status", "completed")
    .not("customer_id", "is", null)
    .gte("end_at", new Date(now.getTime() - MAX_DELAY_MS).toISOString())
    .lte("end_at", new Date(now.getTime() - MIN_DELAY_MS).toISOString())
    .limit(BATCH_LIMIT);
  if (error) {
    logger.warn({ err: error }, "survey_candidates_query_failed");
    return [];
  }
  const rows = ((completed ?? []) as unknown as CompletedRow[]).filter((r) => r.customers?.phone);
  if (rows.length === 0) return [];

  const orgIds = [...new Set(rows.map((r) => r.organization_id))];
  const [orgs, profiles, existing] = await Promise.all([
    insforgeAdmin.database.from("organizations").select("id, status, disabled_modules").in("id", orgIds),
    insforgeAdmin.database.from("business_profiles").select("organization_id, name, survey_auto_send").in("organization_id", orgIds),
    insforgeAdmin.database
      .from("survey_requests")
      .select("reservation_id")
      .in(
        "reservation_id",
        rows.map((r) => r.id)
      )
  ]);
  if (orgs.error || profiles.error || existing.error) {
    logger.warn({ err: orgs.error ?? profiles.error ?? existing.error }, "survey_candidates_context_failed");
    return [];
  }

  const enabledOrgs = new Set(
    ((orgs.data ?? []) as { id: string; status: string; disabled_modules: string[] | null }[])
      .filter((o) => o.status === "active" && !(o.disabled_modules ?? []).includes("surveys"))
      .map((o) => o.id)
  );
  const profileByOrg = new Map(
    ((profiles.data ?? []) as { organization_id: string; name: string; survey_auto_send: boolean | null }[]).map((p) => [p.organization_id, p])
  );
  const alreadyAsked = new Set(((existing.data ?? []) as { reservation_id: string }[]).map((s) => s.reservation_id));

  const eligible = rows.filter(
    (r) => enabledOrgs.has(r.organization_id) && profileByOrg.get(r.organization_id)?.survey_auto_send !== false && !alreadyAsked.has(r.id)
  );

  // Ventana de 24h de WhatsApp: último mensaje del cliente en su conversación.
  const whatsappConversations = eligible.filter((r) => !r.customers!.phone!.startsWith(TELEGRAM_PREFIX) && r.conversation_id).map((r) => r.conversation_id!);
  const openWindow = new Set<string>();
  if (whatsappConversations.length > 0) {
    const { data: recent } = await insforgeAdmin.database
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", whatsappConversations)
      .eq("role", "user")
      .gte("created_at", new Date(now.getTime() - WHATSAPP_WINDOW_MS).toISOString());
    for (const m of (recent ?? []) as { conversation_id: string }[]) openWindow.add(m.conversation_id);
  }

  const seenCustomers = new Set<string>();
  const candidates: SurveyCandidate[] = [];
  for (const r of eligible) {
    const phone = r.customers!.phone!;
    const isTelegram = phone.startsWith(TELEGRAM_PREFIX);
    if (!isTelegram && !(r.conversation_id && openWindow.has(r.conversation_id))) continue;
    // Un cliente con dos atenciones el mismo día recibe una sola encuesta.
    const customerKey = `${r.organization_id}:${r.customer_id}`;
    if (seenCustomers.has(customerKey)) continue;
    seenCustomers.add(customerKey);
    candidates.push({
      reservationId: r.id,
      organizationId: r.organization_id,
      customerId: r.customer_id,
      customerName: r.customer_name || r.customers!.name,
      phone,
      conversationId: r.conversation_id,
      businessName: profileByOrg.get(r.organization_id)?.name ?? "",
      channel: isTelegram ? "telegram" : "whatsapp"
    });
  }
  return candidates;
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

/**
 * Crea la encuesta ANTES de enviar: la restricción única por reserva evita
 * que dos instancias del server la manden dos veces. Si el envío falla, la
 * encuesta queda sin `sent_at` y el negocio puede pedirla a mano.
 */
async function sendOne(c: SurveyCandidate): Promise<boolean> {
  const { data: created, error } = await insforgeAdmin.database
    .from("survey_requests")
    .insert([{ organization_id: c.organizationId, reservation_id: c.reservationId, customer_id: c.customerId }])
    .select("id, token")
    .single();
  if (error || !created) return false; // Ya existe (otra instancia la tomó) u otro error: no reintentar ahora.

  const { id, token } = created as { id: string; token: string };
  const text = buildSurveyText(c.customerName, c.businessName, surveyLink(token));
  try {
    if (c.channel === "telegram") {
      const botToken = await loadTelegramBotToken(c.organizationId);
      if (!botToken) return false;
      await sendTelegramMessage(botToken, c.phone.slice(TELEGRAM_PREFIX.length), text);
    } else {
      await sendWhatsAppMessage(c.organizationId, c.phone, text);
    }
  } catch (err) {
    logger.warn({ reservationId: c.reservationId, organizationId: c.organizationId, err }, "survey_send_failed");
    return false;
  }

  await insforgeAdmin.database
    .from("survey_requests")
    .update({ sent_via: c.channel === "telegram" ? "auto_telegram" : "auto_whatsapp", sent_at: new Date().toISOString() })
    .eq("id", id);
  if (c.conversationId) {
    // Queda en el Inbox y en el historial del agente, por si el cliente contesta.
    await insforgeAdmin.database
      .from("messages")
      .insert([{ organization_id: c.organizationId, conversation_id: c.conversationId, role: "assistant", content: text }]);
  }
  return true;
}

export async function sendDueSurveys(now = new Date()): Promise<{ total: number; sent: number }> {
  const candidates = await findSurveyCandidates(now);
  let sent = 0;
  for (const c of candidates) {
    if (await sendOne(c)) sent++;
  }
  if (candidates.length > 0) logger.info({ total: candidates.length, sent }, "survey_batch_done");
  return { total: candidates.length, sent };
}

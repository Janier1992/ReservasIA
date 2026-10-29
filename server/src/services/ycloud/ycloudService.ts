import crypto from "node:crypto";
import { decryptCredentials } from "../../lib/credentialsCrypto.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";

/**
 * WhatsApp por YCloud (socio oficial de Meta) en modo "coexistencia": el
 * negocio sigue usando su app de WhatsApp Business con el mismo número y el
 * agente atiende por la API. Cada negocio conecta su propia cuenta de YCloud
 * (functions/ycloud-connect.ts): ahí se guarda su API key, su número y el
 * secreto con el que YCloud firma los webhooks que manda a
 * /api/webhooks/ycloud/:organizationId.
 */

export const YCLOUD_API_BASE = "https://api.ycloud.com/v2";
export const SEND_TIMEOUT_MS = 10_000;
// YCloud firma cada entrega con su hora: una firma más vieja que esto se
// rechaza para que no se pueda reenviar un webhook capturado.
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export interface YCloudCredentials {
  api_key: string;
  webhook_secret: string;
  webhook_endpoint_id?: string;
}

export interface YCloudIntegration {
  organizationId: string;
  credentials: YCloudCredentials;
  /** Número de WhatsApp del negocio en formato +<código país><número>. */
  phoneNumber: string;
  /** integrations.metadata tal cual (waba_id, plantilla de recordatorio, etc.). */
  metadata: Record<string, unknown>;
}

/** "+573001112233" sin importar si llega con o sin "+" (o con el prefijo de Twilio). */
export function normalizeWhatsAppPhone(value: string): string {
  const digits = value.replace(/^whatsapp:/, "").replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Header "YCloud-Signature: t=<unix segundos>,s=<firma>", donde la firma es
 * HMAC-SHA256("<t>.<cuerpo crudo>") con el secreto del endpoint. Se acepta la
 * firma en hex o en base64 (la documentación no fija la codificación).
 */
export function verifyYCloudSignature(secret: string, header: string | undefined, rawBody: string, now: number = Date.now()): boolean {
  if (!secret || !header) return false;
  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    })
  );
  const timestamp = parts.get("t");
  const signature = parts.get("s");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > SIGNATURE_TOLERANCE_MS) return false;

  const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return safeEqual(signature, hmac.toString("hex")) || safeEqual(signature, hmac.toString("base64"));
}

/** Integración de YCloud conectada del negocio, o null si no la tiene. */
export async function loadYCloudIntegration(organizationId: string): Promise<YCloudIntegration | null> {
  const { data } = await insforgeAdmin.database
    .from("integrations")
    .select("credentials, metadata, status")
    .eq("organization_id", organizationId)
    .eq("provider", "ycloud")
    .eq("status", "connected")
    .maybeSingle();
  const credentials = decryptCredentials(data?.credentials as Record<string, unknown> | null) as Partial<YCloudCredentials>;
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
  const phoneNumber = typeof metadata.phone_number === "string" ? metadata.phone_number : "";
  if (!credentials?.api_key || !credentials.webhook_secret || !phoneNumber) return null;
  return { organizationId, credentials: credentials as YCloudCredentials, phoneNumber: normalizeWhatsAppPhone(phoneNumber), metadata };
}

/**
 * Texto libre por WhatsApp: Meta solo lo entrega dentro de las 24 h desde el
 * último mensaje del cliente (fuera de eso hace falta una plantilla).
 */
export async function sendYCloudText(integration: YCloudIntegration, toPhone: string, body: string): Promise<void> {
  const to = normalizeWhatsAppPhone(toPhone);
  const res = await fetch(`${YCLOUD_API_BASE}/whatsapp/messages/sendDirectly`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": integration.credentials.api_key },
    body: JSON.stringify({ from: integration.phoneNumber, to, type: "text", text: { body } }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`YCloud respondió ${res.status} al enviar el mensaje: ${detail.slice(0, 300)}`);
  }
  // El envío directo también puede volver con el mensaje ya rechazado por WhatsApp.
  const message = (await res.json().catch(() => null)) as {
    id?: string;
    wamid?: string;
    status?: string;
    errorCode?: string;
    errorMessage?: string;
  } | null;
  if (message?.status === "failed") {
    throw new Error(`WhatsApp rechazó el mensaje (${message.errorCode ?? "sin código"}): ${message.errorMessage ?? ""}`);
  }
  await claimSentMessage(integration.organizationId, to, [message?.wamid, message?.id]);
}

/**
 * Los ecos de YCloud son solo de lo que el negocio escribe en su app, pero
 * por si alguna vez llegara el eco de un mensaje enviado por la API, se deja
 * reclamado su id: ese eco se descarta como repetido y no pausa al agente.
 */
export async function claimSentMessage(organizationId: string, customerPhone: string, ids: (string | undefined)[]): Promise<void> {
  const rows = ids
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ organization_id: organizationId, channel: "whatsapp", external_conversation_id: customerPhone, external_message_id: id }));
  if (rows.length === 0) return;
  const { error } = await insforgeAdmin.database.from("inbound_message_claims").insert(rows);
  if (error && (error as { code?: string }).code !== "23505") {
    logger.warn({ organizationId, err: error }, "ycloud_sent_message_claim_failed");
  }
}

import twilio from "twilio";
import { env } from "../../config/env.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import type { Integration } from "../../types/domain.js";

interface TwilioCredentials {
  account_sid: string;
  auth_token: string;
}

function normalizeWhatsAppAddress(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

/**
 * Un único webhook de Twilio puede recibir mensajes de múltiples números,
 * cada uno perteneciente a una organización distinta. El routing se hace
 * por el número "To" (el número de WhatsApp del negocio que Twilio
 * anuncia como receptor), nunca asumiendo una organización fija.
 */
export async function resolveOrganizationForIncomingNumber(
  toAddress: string
): Promise<{ organizationId: string; credentials: TwilioCredentials } | null> {
  const normalized = normalizeWhatsAppAddress(toAddress);

  const { data, error } = await insforgeAdmin.database
    .from("integrations")
    .select("organization_id, credentials, metadata, status")
    .eq("provider", "twilio")
    .eq("status", "connected")
    .eq("metadata->>whatsapp_number", normalized);

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo resolver la organización destino.", 500);
  if (!data || data.length === 0) return null;

  const row = data[0] as Pick<Integration, "organization_id" | "credentials">;
  return { organizationId: row.organization_id, credentials: row.credentials as unknown as TwilioCredentials };
}

export function validateTwilioSignature(
  authToken: string,
  signature: string | undefined,
  fullUrl: string,
  params: Record<string, unknown>
): boolean {
  if (!env.TWILIO_VALIDATE_SIGNATURE) return true;
  if (!signature) return false;
  return twilio.validateRequest(authToken, signature, fullUrl, params as Record<string, string>);
}

export async function sendWhatsAppMessage(organizationId: string, toPhone: string, body: string): Promise<void> {
  const { data, error } = await insforgeAdmin.database
    .from("integrations")
    .select("credentials, metadata, status")
    .eq("organization_id", organizationId)
    .eq("provider", "twilio")
    .maybeSingle();

  if (error || !data || data.status !== "connected") {
    throw new AppError(ErrorCodes.INTEGRATION_NOT_CONNECTED, "WhatsApp no está conectado para esta organización.", 409);
  }

  const credentials = data.credentials as unknown as TwilioCredentials;
  const fromNumber = (data.metadata as Record<string, unknown>).whatsapp_number as string;

  const client = twilio(credentials.account_sid, credentials.auth_token);
  await client.messages.create({
    from: fromNumber,
    to: normalizeWhatsAppAddress(toPhone),
    body
  });
}

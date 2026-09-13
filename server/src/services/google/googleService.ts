import crypto from "node:crypto";
import { google } from "googleapis";
import { env } from "../../config/env.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import type { Integration, Reservation } from "../../types/domain.js";

const STATE_TTL_MS = 5 * 60 * 1000;

/**
 * Verifica el `state` firmado por la Edge Function google-oauth-start
 * (que corre en Deno y genera la URL de consentimiento). Ambos lados usan
 * el mismo esquema: JSON en base64url + HMAC-SHA256 en base64url,
 * separados por un punto — interoperable entre Deno y Node porque ambos
 * implementan RFC 4648 base64url sobre los mismos bytes.
 */
function verifyState(state: string): { organizationId: string } {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Estado de OAuth inválido.", 400);
  }
  const expected = crypto.createHmac("sha256", env.OAUTH_STATE_SECRET).update(encoded).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Estado de OAuth inválido.", 400);
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as {
    organizationId: string;
    ts: number;
  };
  if (Date.now() - payload.ts > STATE_TTL_MS) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "El enlace de conexión con Google expiró, intentá de nuevo.", 400);
  }
  return { organizationId: payload.organizationId };
}

function newOAuthClient() {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

async function loadIntegration(organizationId: string): Promise<Integration | null> {
  const { data, error } = await insforgeAdmin.database
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo cargar la integración de Google Calendar.", 500);
  return (data as Integration) ?? null;
}

async function persistCredentials(
  organizationId: string,
  credentials: Record<string, unknown>,
  metadata: Record<string, unknown>,
  status: Integration["status"]
) {
  await insforgeAdmin.database.from("integrations").upsert(
    [
      {
        organization_id: organizationId,
        provider: "google_calendar",
        status,
        credentials,
        metadata,
        connected_at: status === "connected" ? new Date().toISOString() : null
      }
    ],
    { onConflict: "organization_id,provider" }
  );
}

export async function handleGoogleOAuthCallback(code: string, state: string): Promise<{ organizationId: string }> {
  const { organizationId } = verifyState(state);
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data: userInfo } = await oauth2.userinfo.get();

  await persistCredentials(
    organizationId,
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date
    },
    { email: userInfo.email ?? null, calendarId: "primary" },
    "connected"
  );

  return { organizationId };
}

async function getAuthorizedClient(organizationId: string) {
  const integration = await loadIntegration(organizationId);
  if (!integration || integration.status !== "connected") return null;

  const client = newOAuthClient();
  client.setCredentials(integration.credentials);

  client.on("tokens", (tokens) => {
    const merged = { ...integration.credentials, ...tokens };
    persistCredentials(organizationId, merged, integration.metadata, "connected").catch((err) =>
      logger.warn({ organizationId, err }, "google_token_refresh_persist_failed")
    );
  });

  return client;
}

/**
 * Sólo el negocio pasa por el consentimiento de Google (una vez, al conectar
 * la integración). El cliente que reserva NUNCA hace su propio login de
 * Google: recibe su reserva en SU calendario porque lo agregamos como
 * "attendee" del evento con `sendUpdates: "all"`, que es lo que hace que
 * Google le mande el mail de invitación y, si usa Gmail/Google Calendar, el
 * evento le aparezca automáticamente en su propio calendario. Por eso hace
 * falta el email del cliente (ver `email_cliente` en el agente y el campo
 * opcional del formulario de reserva del dashboard); sin email no hay forma
 * de invitarlo, y la reserva igual se crea en el calendario del negocio.
 */
async function loadCustomerEmail(customerId: string | null): Promise<{ email: string | null; name: string | null }> {
  if (!customerId) return { email: null, name: null };
  const { data } = await insforgeAdmin.database.from("customers").select("email, name").eq("id", customerId).maybeSingle();
  return { email: data?.email ?? null, name: data?.name ?? null };
}

function buildEventBody(reservation: Reservation, timezone: string, attendee: { email: string | null; name: string | null }) {
  const descriptionLines = [
    `Cliente: ${reservation.customer_name ?? "N/D"}`,
    reservation.party_size ? `Personas: ${reservation.party_size}` : null,
    reservation.special_requests ? `Notas: ${reservation.special_requests}` : null,
    `ID de reserva: ${reservation.id}`
  ].filter(Boolean);

  return {
    summary: `Reserva: ${reservation.customer_name ?? "Cliente"}`,
    description: descriptionLines.join("\n"),
    start: { dateTime: reservation.start_at, timeZone: timezone },
    end: { dateTime: reservation.end_at, timeZone: timezone },
    attendees: attendee.email
      ? [{ email: attendee.email, displayName: attendee.name ?? reservation.customer_name ?? undefined }]
      : undefined
  };
}

async function loadOrganizationTimezone(organizationId: string): Promise<string> {
  const { data } = await insforgeAdmin.database
    .from("organizations")
    .select("timezone")
    .eq("id", organizationId)
    .maybeSingle();
  return data?.timezone ?? env.DEFAULT_TIMEZONE;
}

export async function createCalendarEvent(reservation: Reservation): Promise<string | null> {
  const client = await getAuthorizedClient(reservation.organization_id);
  if (!client) return null;

  const [timezone, attendee] = await Promise.all([
    loadOrganizationTimezone(reservation.organization_id),
    loadCustomerEmail(reservation.customer_id)
  ]);
  const calendar = google.calendar({ version: "v3", auth: client });
  const { data } = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: attendee.email ? "all" : "none",
    requestBody: buildEventBody(reservation, timezone, attendee)
  });

  return data.id ?? null;
}

export async function updateCalendarEvent(reservation: Reservation): Promise<void> {
  if (!reservation.google_event_id) return;
  const client = await getAuthorizedClient(reservation.organization_id);
  if (!client) return;

  const [timezone, attendee] = await Promise.all([
    loadOrganizationTimezone(reservation.organization_id),
    loadCustomerEmail(reservation.customer_id)
  ]);
  const calendar = google.calendar({ version: "v3", auth: client });
  await calendar.events.patch({
    calendarId: "primary",
    eventId: reservation.google_event_id,
    sendUpdates: attendee.email ? "all" : "none",
    requestBody: buildEventBody(reservation, timezone, attendee)
  });
}

export async function deleteCalendarEvent(organizationId: string, eventId: string): Promise<void> {
  const client = await getAuthorizedClient(organizationId);
  if (!client) return;

  const calendar = google.calendar({ version: "v3", auth: client });
  try {
    // sendUpdates:"all" para que, si el cliente había sido invitado, también
    // reciba el aviso de cancelación en su Google Calendar.
    await calendar.events.delete({ calendarId: "primary", eventId, sendUpdates: "all" });
  } catch (err: unknown) {
    const status = (err as { code?: number; response?: { status?: number } })?.response?.status;
    if (status !== 404 && status !== 410) throw err;
  }
}

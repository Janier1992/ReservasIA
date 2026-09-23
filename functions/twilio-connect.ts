// Edge Function: twilio-connect
// Guarda las credenciales de Twilio/WhatsApp de una organización. Escribe
// la columna integrations.credentials, que está REVOCADA para el rol
// `authenticated` a nivel de columna (ver migración de integrations) — por
// eso esta operación necesita el admin client (project_admin bypassa RLS
// y privilegios de columna).
import { createAdminClient, createClient } from "npm:@insforge/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function normalizeWhatsApp(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

const CONTENT_API_BASE = "https://content.twilio.com/v1/Content";

/**
 * WhatsApp solo permite texto libre dentro de las 24h posteriores al último
 * mensaje del cliente; fuera de esa ventana (el caso típico de un
 * recordatorio de una reserva hecha con días de anticipación) Meta exige
 * una plantilla pre-aprobada. Cada negocio trae su propia cuenta de
 * Twilio, así que la plantilla se crea y somete a aprobación DENTRO de esa
 * cuenta en el momento de conectar WhatsApp — no hace falta que nadie la
 * pida a mano, y una vez aprobada (normalmente minutos, hasta 24-48h según
 * Twilio) el recordatorio automático empieza a funcionar solo.
 *
 * Falla en silencio (best-effort): si esto no funciona, el negocio igual
 * queda conectado para responder por WhatsApp — el recordatorio
 * proactivo es una mejora aparte, no debe bloquear la conexión principal.
 */
async function createAndSubmitReminderTemplate(accountSid: string, authToken: string): Promise<string | null> {
  const auth = "Basic " + btoa(`${accountSid}:${authToken}`);

  try {
    const createRes = await fetch(CONTENT_API_BASE, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        friendly_name: `reservasia_recordatorio_${Date.now()}`,
        language: "es",
        variables: { "1": "cliente", "2": "el negocio", "3": "el turno" },
        types: {
          "twilio/text": {
            body: "¡Hola {{1}}! Te recordamos tu reserva en {{2}} para el {{3}}. Si necesitás cambiarla o cancelarla, escribinos por acá."
          }
        }
      })
    });
    const created = (await createRes.json()) as { sid?: string; message?: string };
    if (!createRes.ok || !created.sid) {
      console.error("twilio_reminder_template_create_failed", created);
      return null;
    }

    const approvalRes = await fetch(`${CONTENT_API_BASE}/${created.sid}/ApprovalRequests/whatsapp`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `reservasia_recordatorio_${created.sid}`, category: "UTILITY" })
    });
    if (!approvalRes.ok) {
      const approvalError = await approvalRes.text().catch(() => "");
      // La plantilla ya existe (created.sid es válido) aunque el envío a
      // aprobación haya fallado — se puede reintentar la aprobación
      // después desde la consola de Twilio con ese mismo Content Sid.
      console.error("twilio_reminder_template_approval_failed", approvalError);
    }

    return created.sid;
  } catch (err) {
    console.error("twilio_reminder_template_setup_failed", err);
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const authHeader = req.headers.get("Authorization");
  const userToken = authHeader?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  let body: { organization_id?: string; accountSid?: string; authToken?: string; whatsappNumber?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);
  }

  const { organization_id: organizationId, accountSid, authToken, whatsappNumber } = body;
  if (!organizationId || !accountSid || !authToken || !whatsappNumber) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Faltan campos requeridos." } }, 400);
  }

  const { data: membership } = await userClient.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return jsonResponse({ error: { code: "FORBIDDEN" } }, 403);
  }

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });

  // Si ya había una plantilla creada para este negocio (ej. está solo
  // actualizando el número o reconectando), se reutiliza en vez de crear
  // y someter una plantilla nueva a Meta cada vez.
  const { data: existing } = await admin.database
    .from("integrations")
    .select("metadata")
    .eq("organization_id", organizationId)
    .eq("provider", "twilio")
    .maybeSingle();
  const existingTemplateSid = (existing?.metadata as Record<string, unknown> | null)?.reminder_template_sid as string | undefined;

  const reminderTemplateSid = existingTemplateSid ?? (await createAndSubmitReminderTemplate(accountSid, authToken));

  const { error } = await admin.database.from("integrations").upsert(
    [
      {
        organization_id: organizationId,
        provider: "twilio",
        status: "connected",
        credentials: { account_sid: accountSid, auth_token: authToken },
        metadata: {
          whatsapp_number: normalizeWhatsApp(whatsappNumber),
          ...(reminderTemplateSid ? { reminder_template_sid: reminderTemplateSid } : {})
        },
        connected_at: new Date().toISOString()
      }
    ],
    { onConflict: "organization_id,provider" }
  );

  if (error) {
    console.error("twilio_connect_upsert_failed", error);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo guardar la integración." } }, 500);
  }

  return jsonResponse({ status: "connected", reminderTemplateConfigured: !!reminderTemplateSid }, 200);
}

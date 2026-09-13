// Edge Function: telegram-connect
// Guarda el bot token de Telegram de una organización, validándolo primero
// contra la API de Telegram (getMe). A diferencia de Twilio/Google, no hace
// falta configurar ningún webhook acá: el compute service atiende cada bot
// conectado con su propio loop de long-polling (ver
// server/src/services/telegram/telegramPollingManager.ts), así que no se
// necesita una URL pública.
import { createAdminClient, createClient } from "npm:@insforge/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  let body: { organization_id?: string; botToken?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);
  }

  const organizationId = body.organization_id;
  const botToken = body.botToken?.trim();
  if (!organizationId || !botToken) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "organization_id y botToken son requeridos." } }, 400);
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

  let botInfo: { id: number; username?: string; first_name?: string };
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = await meRes.json();
    if (!meRes.ok || !meData.ok) {
      return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "El bot token no es válido." } }, 400);
    }
    botInfo = meData.result;
  } catch {
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo contactar a la API de Telegram." } }, 502);
  }

  // El compute service atiende este bot con long-polling (getUpdates), que
  // Telegram rechaza con 409 Conflict si el bot tiene un webhook activo de
  // una integración anterior (ej. Make/Zapier/n8n). Lo limpiamos acá para
  // que la conexión funcione sin que el usuario tenga que diagnosticarlo.
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=true`);
  } catch (err) {
    console.warn("telegram_connect_delete_webhook_failed", err);
  }

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { error } = await admin.database.from("integrations").upsert(
    [
      {
        organization_id: organizationId,
        provider: "telegram",
        status: "connected",
        credentials: { bot_token: botToken },
        metadata: { bot_username: botInfo.username ?? null, bot_first_name: botInfo.first_name ?? null },
        connected_at: new Date().toISOString()
      }
    ],
    { onConflict: "organization_id,provider" }
  );

  if (error) {
    console.error("telegram_connect_upsert_failed", error);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo guardar la integración." } }, 500);
  }

  return jsonResponse({ status: "connected", botUsername: botInfo.username ?? null }, 200);
}

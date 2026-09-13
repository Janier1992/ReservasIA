// Edge Function: conversations-reply
// Respuesta manual de un miembro del staff desde el Inbox (punto 32 del
// prompt maestro). Inserta el mensaje y, si la conversación es de
// WhatsApp, lo envía por la API de Twilio usando las credenciales
// guardadas (columna integrations.credentials, sólo accesible vía admin).
import { createAdminClient, createClient } from "npm:@insforge/sdk";
import twilio from "npm:twilio";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const MAX_MESSAGE_LENGTH = 4000;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  let body: { organization_id?: string; conversation_id?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);
  }

  const organizationId = body.organization_id;
  const conversationId = body.conversation_id;
  const content = (body.content ?? "").slice(0, MAX_MESSAGE_LENGTH).trim();
  if (!organizationId || !conversationId || !content) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "organization_id, conversation_id y content son requeridos." } }, 400);
  }

  const { data: membership } = await userClient.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership) return jsonResponse({ error: { code: "NOT_A_MEMBER" } }, 403);

  const { data: conversation } = await userClient.database
    .from("conversations")
    .select("*, customers(phone)")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!conversation) return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "La conversación no existe." } }, 404);

  const { data: message, error: insertError } = await userClient.database
    .from("messages")
    .insert([{ organization_id: organizationId, conversation_id: conversationId, role: "staff", content }])
    .select()
    .single();

  if (insertError || !message) {
    console.error("conversations_reply_insert_failed", insertError);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo guardar el mensaje." } }, 500);
  }

  const customerPhone = (conversation as { customers?: { phone?: string } | null }).customers?.phone;
  if (conversation.channel === "whatsapp" && customerPhone) {
    const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
    const { data: integration } = await admin.database
      .from("integrations")
      .select("credentials, metadata, status")
      .eq("organization_id", organizationId)
      .eq("provider", "twilio")
      .maybeSingle();

    if (integration?.status === "connected") {
      try {
        const credentials = integration.credentials as { account_sid: string; auth_token: string };
        const fromNumber = (integration.metadata as Record<string, unknown>).whatsapp_number as string;
        const twilioClient = twilio(credentials.account_sid, credentials.auth_token);
        const toAddress = customerPhone.startsWith("whatsapp:") ? customerPhone : `whatsapp:${customerPhone}`;
        await twilioClient.messages.create({ from: fromNumber, to: toAddress, body: content });
      } catch (err) {
        console.error("conversations_reply_twilio_send_failed", err);
      }
    }
  }

  return jsonResponse(message, 201);
}

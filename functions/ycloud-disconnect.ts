// Edge Function: ycloud-disconnect
// Desconecta el WhatsApp por YCloud del negocio: borra en YCloud el webhook
// que se creó al conectar (para que deje de mandar mensajes) y marca la
// integración como desconectada. El número sigue funcionando normal en la
// app de WhatsApp Business del negocio.
import { createAdminClient, createClient } from "npm:@insforge/sdk";
import { decryptCredentials } from "./_shared/credentialsCrypto.ts";

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

  let body: { organization_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);
  }
  const organizationId = body.organization_id;
  if (!organizationId) return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);

  // Redeploy forzado 2026-10-30 ter (ver ycloud-connect.ts): recoger el secreto actualizado.
  const encryptionKey = Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return jsonResponse({ error: { code: "NOT_CONFIGURED", message: "Falta configurar el cifrado de credenciales en el servidor." } }, 500);
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
  const { data: current } = await admin.database
    .from("integrations")
    .select("credentials")
    .eq("organization_id", organizationId)
    .eq("provider", "ycloud")
    .maybeSingle();
  const credentials = (await decryptCredentials(current?.credentials as Record<string, unknown> | null, encryptionKey)) as {
    api_key?: string;
    webhook_endpoint_id?: string;
  };
  if (credentials?.api_key && credentials.webhook_endpoint_id) {
    try {
      await fetch(`https://api.ycloud.com/v2/webhookEndpoints/${credentials.webhook_endpoint_id}`, {
        method: "DELETE",
        headers: { "X-API-Key": credentials.api_key }
      });
    } catch (err) {
      // Sin credenciales guardadas, el compute service igual rechaza lo que llegue (404).
      console.warn("ycloud_disconnect_delete_webhook_failed", err);
    }
  }

  const { error } = await admin.database
    .from("integrations")
    .update({ status: "disconnected", credentials: {}, connected_at: null })
    .eq("organization_id", organizationId)
    .eq("provider", "ycloud");

  if (error) return jsonResponse({ error: { code: "INTERNAL_ERROR" } }, 500);
  return jsonResponse({ status: "disconnected" }, 200);
}

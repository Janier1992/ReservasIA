import { createAdminClient, createClient } from "npm:@insforge/sdk";
import { google } from "npm:googleapis";
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

  // Redeploy forzado 2026-10-30 (ver ycloud-connect.ts): recoger el secreto actualizado.
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
  const { data: integration } = await admin.database
    .from("integrations")
    .select("credentials")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  const credentials = await decryptCredentials(integration?.credentials as Record<string, unknown> | null, encryptionKey);
  const accessToken = credentials.access_token as string | undefined;
  if (accessToken) {
    try {
      const oauthClient = new google.auth.OAuth2();
      await oauthClient.revokeToken(accessToken);
    } catch (err) {
      console.warn("google_revoke_token_failed", err);
    }
  }

  const { error } = await admin.database
    .from("integrations")
    .update({ status: "disconnected", credentials: {}, connected_at: null })
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar");

  if (error) return jsonResponse({ error: { code: "INTERNAL_ERROR" } }, 500);
  return jsonResponse({ status: "disconnected" }, 200);
}

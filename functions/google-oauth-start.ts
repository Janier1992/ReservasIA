// Edge Function: google-oauth-start
// Devuelve la URL de consentimiento de Google OAuth para conectar Google
// Calendar. El `state` va firmado con HMAC (OAUTH_STATE_SECRET) para que
// el callback (manejado por el compute service, no por una Edge Function,
// ver PRP) pueda confiar en qué organización inició el flujo sin volver a
// pedir autenticación (Google redirige el navegador directo al backend).
import { createClient } from "npm:@insforge/sdk";
import { google } from "npm:googleapis";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/userinfo.email"];

async function signState(organizationId: string, secret: string): Promise<string> {
  const payload = JSON.stringify({ organizationId, ts: Date.now(), nonce: crypto.randomUUID() });
  const encoded = btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${encoded}.${signature}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);

  const { data: membership } = await userClient.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return jsonResponse({ error: { code: "FORBIDDEN" } }, 403);
  }

  const oauthClient = new google.auth.OAuth2(
    Deno.env.get("GOOGLE_CLIENT_ID"),
    Deno.env.get("GOOGLE_CLIENT_SECRET"),
    Deno.env.get("GOOGLE_REDIRECT_URI")
  );

  const state = await signState(organizationId, Deno.env.get("OAUTH_STATE_SECRET")!);
  const authUrl = oauthClient.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES, state });

  return jsonResponse({ url: authUrl }, 200);
}

// Edge Function: get-receipt-url
// El dashboard nunca guarda comprobantes de pago en un bucket público: esta
// función valida que quien pide la URL sea miembro de la organización dueña
// del mensaje, y recién ahí genera una signed URL de corta duración con el
// cliente admin (el único con permiso para leer el bucket privado
// payment-receipts).
import { createAdminClient, createClient } from "npm:@insforge/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

const SIGNED_URL_TTL_SECONDS = 300;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const client = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await client.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id");
  const messageId = url.searchParams.get("message_id");
  if (!organizationId || !messageId) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "organization_id y message_id son requeridos." } }, 400);
  }

  const { data: membership } = await client.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership) return jsonResponse({ error: { code: "NOT_A_MEMBER" } }, 403);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: message } = await admin.database
    .from("messages")
    .select("metadata, message_type")
    .eq("organization_id", organizationId)
    .eq("id", messageId)
    .maybeSingle();

  if (!message || message.message_type !== "image") {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "El mensaje no tiene una imagen adjunta." } }, 404);
  }

  const storagePath = (message.metadata as Record<string, unknown> | null)?.storage_path as string | undefined;
  if (!storagePath) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "El mensaje no tiene un archivo asociado." } }, 404);
  }

  const { data: signed, error } = await admin.storage.from("payment-receipts").createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) {
    console.error("get_receipt_url_signing_failed", error);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo generar el enlace del comprobante." } }, 500);
  }

  return jsonResponse({ url: signed.signedUrl, expires_at: signed.expiresAt }, 200);
}

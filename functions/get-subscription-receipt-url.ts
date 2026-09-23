// Edge Function: get-subscription-receipt-url
// URL firmada de corta duración para ver un comprobante de pago de
// suscripción — el bucket es privado, así que ni soporte ni el propio
// negocio pueden leerlo directo, solo a través de esta función.
import { createAdminClient, createClient } from "npm:@insforge/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const SIGNED_URL_TTL_SECONDS = 300;

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
  const paymentId = url.searchParams.get("payment_id");
  if (!paymentId) return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "payment_id es requerido." } }, 400);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: payment } = await admin.database
    .from("subscription_payments")
    .select("organization_id, receipt_storage_path")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "El pago no existe." } }, 404);

  const { data: staffRow } = await userClient.database.from("support_staff").select("active").eq("user_id", userData.user.id).maybeSingle();
  const { data: membership } = await userClient.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", payment.organization_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!staffRow?.active && !membership) {
    return jsonResponse({ error: { code: "FORBIDDEN" } }, 403);
  }

  const { data: signed, error } = await admin.storage
    .from("subscription-receipts")
    .createSignedUrl(payment.receipt_storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !signed) {
    console.error("get_subscription_receipt_url_signing_failed", error);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo generar el enlace del comprobante." } }, 500);
  }

  return jsonResponse({ url: signed.signedUrl, expires_at: signed.expiresAt }, 200);
}

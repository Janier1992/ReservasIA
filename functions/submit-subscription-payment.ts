// Edge Function: submit-subscription-payment
// Recibe el comprobante en base64 y lo sube acá mismo, con la clave admin,
// al bucket privado "subscription-receipts" — igual que payment-receipts
// (ver server/src/services/storage/receiptsService.ts), no con un upload
// directo del navegador: un bucket privado no acepta escrituras directas
// de "authenticated" aunque la RLS policy esté bien (comprobado en
// producción 2026-10-30, ver subscription_receipts_owner_insert en
// 20260923120000_subscription-payments.sql; la policy queda documentando
// la intención pero esta función es la que realmente escribe). Después
// registra el reporte de pago y avisa a soporte por correo.
import { createAdminClient, createClient } from "npm:@insforge/sdk";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const SUPPORT_EMAIL = "synflow.ia@gmail.com";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  let body: { organization_id?: string; receipt_base64?: string; receipt_mime_type?: string; amount?: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);
  }

  const { organization_id: organizationId, receipt_base64: receiptBase64, receipt_mime_type: receiptMimeType, amount, note } = body;
  if (!organizationId || !receiptBase64 || !receiptMimeType) {
    return jsonResponse(
      { error: { code: "VALIDATION_ERROR", message: "organization_id, receipt_base64 y receipt_mime_type son requeridos." } },
      400
    );
  }

  const extension = ALLOWED_MIME_EXTENSIONS[receiptMimeType];
  if (!extension) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "El comprobante debe ser una imagen (jpg, png o webp)." } }, 400);
  }

  let receiptBytes: Uint8Array;
  try {
    receiptBytes = Uint8Array.from(atob(receiptBase64), (c) => c.charCodeAt(0));
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "El comprobante no se pudo leer." } }, 400);
  }
  if (receiptBytes.length === 0 || receiptBytes.length > MAX_RECEIPT_BYTES) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "La imagen no puede superar 5 MB." } }, 400);
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

  // Bucket privado: lo sube la clave admin, no el navegador directo (ver
  // comentario del encabezado de este archivo).
  const receiptPath = `${organizationId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("subscription-receipts")
    .upload(receiptPath, new Blob([receiptBytes], { type: receiptMimeType }));
  if (uploadError) {
    console.error("submit_subscription_payment_upload_failed", uploadError);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo subir el comprobante." } }, 500);
  }

  const { data: payment, error: insertError } = await admin.database
    .from("subscription_payments")
    .insert([
      {
        organization_id: organizationId,
        submitted_by: userData.user.id,
        receipt_storage_path: receiptPath,
        amount: amount ?? null,
        note: note ?? null
      }
    ])
    .select("id")
    .single();

  if (insertError || !payment) {
    console.error("submit_subscription_payment_insert_failed", insertError);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo registrar el pago reportado." } }, 500);
  }

  const { data: profile } = await admin.database
    .from("business_profiles")
    .select("name")
    .eq("organization_id", organizationId)
    .maybeSingle();

  try {
    await admin.emails.send({
      to: SUPPORT_EMAIL,
      subject: `Nuevo pago reportado: ${profile?.name ?? organizationId}`,
      html: `<p>El negocio <strong>${profile?.name ?? organizationId}</strong> reportó un pago de suscripción.</p>
        <p>Monto informado: ${amount ?? "no especificado"}</p>
        <p>Nota: ${note ?? "—"}</p>
        <p>Revisalo y confirmalo desde el panel de soporte.</p>`
    });
  } catch (err) {
    // Best-effort: el pago ya quedó registrado y visible en /soporte aunque
    // el correo falle — no bloquea el flujo principal.
    console.error("submit_subscription_payment_email_failed", err);
  }

  return jsonResponse({ id: payment.id, status: "pending" }, 201);
}

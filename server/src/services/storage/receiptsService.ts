import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";

const RECEIPTS_BUCKET = "payment-receipts";

/**
 * Sube el comprobante de pago a un bucket privado. La ruta incluye la
 * organización para poder aplicar políticas de acceso por tenant si el
 * bucket alguna vez pasa a tener reglas propias, y un timestamp + el
 * update_id de Telegram para que nunca colisione con otra subida.
 */
export async function uploadPaymentReceipt(
  organizationId: string,
  conversationId: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<string> {
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const path = `${organizationId}/${conversationId}/${Date.now()}.${extension}`;

  const blob = new Blob([bytes], { type: mimeType });
  const { error } = await insforgeAdmin.storage.from(RECEIPTS_BUCKET).upload(path, blob);
  if (error) {
    logger.error({ organizationId, conversationId, err: error }, "receipt_upload_failed");
    throw new Error(`No se pudo subir el comprobante: ${error.message ?? "error desconocido"}`);
  }

  return path;
}

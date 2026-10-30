// Edge Function: admin-backfill-credentials
// Migración única: cifra en el lugar las filas de `integrations.credentials`
// que quedaron en texto plano de antes de activar INTEGRATIONS_ENCRYPTION_KEY.
// Pensada para invocarse una sola vez, directo desde afuera (curl/Postman),
// sin necesitar un server local con las credenciales de producción: la base
// vive en InsForge y Postgres ahí solo tiene `pgcrypto` (sin modo GCM), así
// que esto no se puede hacer con un script SQL — tiene que correr en el
// mismo runtime (Deno) que ya cifra/descifra esta columna.
//
// Protegida con la misma API_KEY de administrador del proyecto (la que ya
// usan todas las demás funciones para su admin client): solo alguien con
// acceso a los secretos de InsForge puede invocarla. Idempotente: una fila
// ya cifrada se detecta por el marcador `_enc` y se deja tal cual.
//
// Borrar esta función (y su deploy) una vez confirmado el resultado: no debe
// quedar permanente en producción.
import { createAdminClient } from "npm:@insforge/sdk";
import { decryptCredentials, encryptCredentials } from "./_shared/credentialsCrypto.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function isAlreadyEncrypted(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as Record<string, unknown>)._enc === "v1";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const apiKey = Deno.env.get("API_KEY");
  const callerKey = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!apiKey || callerKey !== apiKey) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const encryptionKey = Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return jsonResponse({ error: { code: "NOT_CONFIGURED", message: "Falta configurar el cifrado de credenciales en el servidor." } }, 500);
  }

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const admin = createAdminClient({ baseUrl, apiKey });

  const { data, error } = await admin.database.from("integrations").select("id, organization_id, provider, credentials");
  if (error) return jsonResponse({ error: { code: "INTERNAL_ERROR", message: JSON.stringify(error) } }, 500);

  const rows = (data ?? []) as { id: string; organization_id: string; provider: string; credentials: Record<string, unknown> | null }[];

  let encrypted = 0;
  let alreadyEncrypted = 0;
  let empty = 0;
  const failures: { organization_id: string; provider: string; error: unknown }[] = [];

  for (const row of rows) {
    if (!row.credentials || Object.keys(row.credentials).length === 0) {
      empty++;
      continue;
    }
    if (isAlreadyEncrypted(row.credentials)) {
      alreadyEncrypted++;
      continue;
    }

    // decryptCredentials tolera texto plano devolviéndolo tal cual: acá sirve
    // para normalizar el tipo antes de volver a cifrar.
    const plaintext = await decryptCredentials(row.credentials, encryptionKey);
    const { error: updateError } = await admin.database
      .from("integrations")
      .update({ credentials: await encryptCredentials(plaintext, encryptionKey) })
      .eq("id", row.id);

    if (updateError) {
      failures.push({ organization_id: row.organization_id, provider: row.provider, error: updateError });
      continue;
    }
    encrypted++;
  }

  return jsonResponse({ total: rows.length, encrypted, alreadyEncrypted, empty, failures }, 200);
}

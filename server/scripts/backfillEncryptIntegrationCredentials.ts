// Migración única: cifra en el lugar las filas de `integrations.credentials`
// que quedaron en texto plano de antes de activar INTEGRATIONS_ENCRYPTION_KEY.
// Sin este backfill, una integración ya conectada (Google/Telegram/YCloud)
// se cifra sola recién en su próxima escritura (renovación de token,
// reconectar), que para algunas puede no llegar nunca. Idempotente: una fila
// ya cifrada se detecta por el marcador `_enc` y se deja tal cual, así que es
// seguro volver a correrlo.
//
// Uso: npx tsx server/scripts/backfillEncryptIntegrationCredentials.ts
import { decryptCredentials, encryptCredentials } from "../src/lib/credentialsCrypto.js";
import { insforgeAdmin } from "../src/lib/insforge.js";

function isAlreadyEncrypted(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as Record<string, unknown>)._enc === "v1";
}

async function main() {
  const { data, error } = await insforgeAdmin.database.from("integrations").select("id, organization_id, provider, credentials");
  if (error) throw new Error(`No se pudieron leer las integraciones: ${JSON.stringify(error)}`);

  const rows = (data ?? []) as { id: string; organization_id: string; provider: string; credentials: Record<string, unknown> | null }[];

  let encrypted = 0;
  let alreadyEncrypted = 0;
  let empty = 0;

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
    const plaintext = decryptCredentials(row.credentials);
    const { error: updateError } = await insforgeAdmin.database
      .from("integrations")
      .update({ credentials: encryptCredentials(plaintext) })
      .eq("id", row.id);

    if (updateError) {
      console.error(`FALLÓ org=${row.organization_id} provider=${row.provider}:`, updateError);
      continue;
    }
    encrypted++;
    console.log(`cifrada: org=${row.organization_id} provider=${row.provider}`);
  }

  console.log(`\nListo. Filas totales: ${rows.length} — cifradas ahora: ${encrypted}, ya estaban cifradas: ${alreadyEncrypted}, vacías: ${empty}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

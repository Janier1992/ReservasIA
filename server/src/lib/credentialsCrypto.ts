import crypto from "node:crypto";
import { DEFAULT_INTEGRATIONS_ENCRYPTION_KEY, env, isDeployed } from "../config/env.js";

/**
 * Cifra `integrations.credentials` (tokens de Google, API keys de YCloud,
 * bot tokens de Telegram) antes de guardarlo en la base. La misma columna
 * también la escriben y la leen Edge Functions en Deno
 * (functions/_shared/credentialsCrypto.ts): ambos lados derivan la clave AES
 * del mismo secreto con el mismo hash, y el formato en disco (IV + tag
 * pegado al final del ciphertext, ambos en base64) es el que espera
 * `crypto.subtle.decrypt` de Web Crypto, así que cualquiera de los dos
 * entornos puede leer lo que escribió el otro.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENC_MARKER = "v1";

interface EncryptedCredentials {
  _enc: "v1";
  iv: string;
  ct: string;
  [key: string]: unknown;
}

function isEncrypted(value: Record<string, unknown>): value is EncryptedCredentials {
  return value._enc === ENC_MARKER && typeof value.iv === "string" && typeof value.ct === "string";
}

/** Un hash SHA-256 del secreto siempre da los 32 bytes que pide AES-256, sin pedirle al usuario una clave en base64. */
function deriveKey(): Buffer {
  // El valor por defecto está publicado en el repositorio: con él cualquiera
  // podría descifrar las credenciales de integraciones de cualquier negocio.
  if (isDeployed() && env.INTEGRATIONS_ENCRYPTION_KEY === DEFAULT_INTEGRATIONS_ENCRYPTION_KEY) {
    throw new Error("Falta configurar INTEGRATIONS_ENCRYPTION_KEY en el servidor.");
  }
  return crypto.createHash("sha256").update(env.INTEGRATIONS_ENCRYPTION_KEY, "utf-8").digest();
}

/** `{}` (integración desconectada) se deja tal cual: no hay nada que proteger. */
export function encryptCredentials(credentials: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!credentials || Object.keys(credentials).length === 0) return credentials ?? {};
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { _enc: ENC_MARKER, iv: iv.toString("base64"), ct: Buffer.concat([ciphertext, tag]).toString("base64") };
}

/**
 * Tolera texto plano (sin el marcador `_enc`): filas que todavía no se
 * reescribieron desde que se activó el cifrado, o `{}` de una integración
 * desconectada. Así no hace falta migrar las integraciones ya conectadas en
 * producción antes de desplegar esto — se van cifrando solas en su próxima
 * escritura (o con el backfill de scripts/encryptExistingCredentials.ts).
 */
export function decryptCredentials(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value) return {};
  if (!isEncrypted(value)) return value;
  const iv = Buffer.from(value.iv, "base64");
  const combined = Buffer.from(value.ct, "base64");
  const ciphertext = combined.subarray(0, combined.length - TAG_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8")) as Record<string, unknown>;
}

// Cifrado de integrations.credentials, compartido por las Edge Functions que
// conectan/desconectan un canal. Mismo formato que
// server/src/lib/credentialsCrypto.ts (AES-256-GCM derivado por SHA-256 del
// secreto INTEGRATIONS_ENCRYPTION_KEY, IV de 12 bytes, tag de 16 bytes pegado
// al final del ciphertext, todo en base64) para que cualquiera de los dos
// lados pueda leer lo que escribió el otro.

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

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** `{}` (integración desconectada) se deja tal cual: no hay nada que proteger. */
export async function encryptCredentials(
  credentials: Record<string, unknown> | null | undefined,
  secret: string
): Promise<Record<string, unknown>> {
  if (!credentials || Object.keys(credentials).length === 0) return credentials ?? {};
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { _enc: ENC_MARKER, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(encrypted)) };
}

/** Tolera texto plano (sin el marcador `_enc`): ver el comentario equivalente del lado Node. */
export async function decryptCredentials(
  value: Record<string, unknown> | null | undefined,
  secret: string
): Promise<Record<string, unknown>> {
  if (!value) return {};
  if (!isEncrypted(value)) return value;
  const key = await deriveKey(secret);
  const iv = base64ToBytes(value.iv);
  const ciphertext = base64ToBytes(value.ct);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, unknown>;
}

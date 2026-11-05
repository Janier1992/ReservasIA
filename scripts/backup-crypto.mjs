// Cifrado de las copias de seguridad de la base (scripts/backup-database.mjs y
// scripts/decrypt-backup.mjs). El repositorio es público y los artefactos de
// GitHub Actions los puede descargar cualquiera con cuenta de GitHub: por eso
// la copia sale SIEMPRE cifrada, con una frase que solo conoce el dueño
// (secreto BACKUP_PASSPHRASE).
//
// Formato del archivo .rbk (todo binario):
//   "RIABK1" (6 bytes) | sal (16) | iv (12) | etiqueta GCM (16) | datos cifrados
// Los datos son el SQL comprimido con gzip, cifrado con AES-256-GCM; la clave
// sale de la frase con scrypt. GCM detecta cualquier archivo alterado o una
// frase equivocada (falla en vez de devolver basura).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("RIABK1");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
// N alto a propósito: frena probar frases por fuerza bruta si alguien baja el archivo.
const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const MIN_PASSPHRASE_LENGTH = 16;

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, 32, SCRYPT_PARAMS);
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`La frase de cifrado tiene que tener al menos ${MIN_PASSPHRASE_LENGTH} caracteres.`);
  }
}

/** Comprime y cifra el texto de la copia. */
export function encryptBackup(plaintext, passphrase) {
  assertPassphrase(passphrase);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const encrypted = Buffer.concat([cipher.update(gzipSync(Buffer.from(plaintext, "utf8"))), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}

/** Descifra y descomprime una copia; falla si la frase es otra o el archivo cambió. */
export function decryptBackup(file, passphrase) {
  assertPassphrase(passphrase);
  if (file.length < MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Este archivo no es una copia de seguridad de ReservasIA (.rbk).");
  }
  let offset = MAGIC.length;
  const salt = file.subarray(offset, (offset += SALT_BYTES));
  const iv = file.subarray(offset, (offset += IV_BYTES));
  const tag = file.subarray(offset, (offset += TAG_BYTES));
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    const compressed = Buffer.concat([decipher.update(file.subarray(offset)), decipher.final()]);
    return gunzipSync(compressed).toString("utf8");
  } catch {
    throw new Error("No se pudo descifrar: la frase no es la correcta o el archivo está dañado.");
  }
}

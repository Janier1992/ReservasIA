#!/usr/bin/env node
// Copia de seguridad semanal de la base de InsForge (la usa el workflow
// "Backup database"). El plan gratis de InsForge no hace copias automáticas:
// esto exporta esquema y datos con la misma API que `insforge db export`,
// cifra el resultado (ver backup-crypto.mjs) y lo deja en un archivo .rbk.
// El contenido nunca se imprime: tiene datos personales de los clientes.
//
// Uso: INSFORGE_URL=... INSFORGE_API_KEY=... BACKUP_PASSPHRASE=... node scripts/backup-database.mjs <salida.rbk>
import { writeFileSync } from "node:fs";
import { MIN_PASSPHRASE_LENGTH, encryptBackup } from "./backup-crypto.mjs";

const baseUrl = (process.env.INSFORGE_URL ?? "").replace(/\/+$/, "");
const apiKey = process.env.INSFORGE_API_KEY ?? "";
const passphrase = process.env.BACKUP_PASSPHRASE ?? "";
const output = process.argv[2];

if (!baseUrl || !apiKey) {
  console.error("Faltan INSFORGE_URL o INSFORGE_API_KEY.");
  process.exit(1);
}
if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
  console.error(
    `Falta el secreto BACKUP_PASSPHRASE (mínimo ${MIN_PASSPHRASE_LENGTH} caracteres). ` +
      "Sin él la copia no se guarda: el repositorio es público y no puede quedar sin cifrar."
  );
  process.exit(1);
}
if (!output) {
  console.error("Uso: node scripts/backup-database.mjs <salida.rbk>");
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/database/advance/export`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    format: "sql",
    includeData: true,
    includeFunctions: true,
    includeSequences: true,
    includeViews: true
  })
});
if (!res.ok) {
  // Solo el código: el cuerpo de un error podría traer fragmentos de datos.
  console.error(`InsForge no devolvió la exportación: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const raw = await res.text();
let sql = raw;
let tables = null;
try {
  const parsed = JSON.parse(raw);
  if (typeof parsed.content === "string") {
    sql = parsed.content;
    tables = Array.isArray(parsed.tables) ? parsed.tables : null;
  }
} catch {
  // Ya vino como SQL plano.
}

// Una exportación vacía o sin tablas no es una copia: mejor fallar y que se note.
if (!/create table/i.test(sql)) {
  console.error("La exportación no trae ninguna tabla; no se guarda una copia vacía.");
  process.exit(1);
}

const file = encryptBackup(sql, passphrase);
writeFileSync(output, file);
const tableInfo = tables ? `${tables.length} tablas` : "tablas sin contar";
console.log(`Copia lista: ${output} (${tableInfo}, ${(sql.length / 1024).toFixed(0)} KB de SQL, ${(file.length / 1024).toFixed(0)} KB cifrada).`);

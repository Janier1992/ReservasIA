#!/usr/bin/env node
// Descifra una copia de seguridad (.rbk) del workflow "Backup database" y
// deja el SQL listo para restaurar. Se corre en tu computador, nunca en CI:
// el SQL tiene los datos de los clientes.
//
// Uso (te pide la frase sin mostrarla, o la toma de BACKUP_PASSPHRASE):
//   node scripts/decrypt-backup.mjs reservasia-2026-11-08.rbk reservasia-2026-11-08.sql
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { decryptBackup } from "./backup-crypto.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Uso: node scripts/decrypt-backup.mjs <copia.rbk> <salida.sql>");
  process.exit(1);
}

async function askPassphrase() {
  if (process.env.BACKUP_PASSPHRASE) return process.env.BACKUP_PASSPHRASE;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Oculta lo que se escribe.
  rl._writeToOutput = (text) => {
    if (text.includes("Frase")) process.stdout.write(text);
  };
  const answer = await new Promise((resolve) => rl.question("Frase de cifrado: ", resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

try {
  const sql = decryptBackup(readFileSync(input), await askPassphrase());
  writeFileSync(output, sql);
  console.log(`Listo: ${output}. Guardalo en un lugar seguro y borralo cuando ya no lo necesites.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

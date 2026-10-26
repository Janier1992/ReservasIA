#!/usr/bin/env node
// Falla si las dependencias de producción tienen vulnerabilidades altas o
// críticas, salvo las aceptadas abajo con motivo y fecha de revisión. Así un
// aviso sin arreglo disponible no bloquea todos los PR, pero queda a la vista
// y vuelve a bloquear cuando vence su fecha.
//
// Uso: node scripts/audit-check.mjs
import { execFileSync } from "node:child_process";

/** Avisos aceptados temporalmente: { id GHSA: { reason, reviewBy: "AAAA-MM-DD" } }. */
const ACCEPTED = {
  "GHSA-mrhx-c7xc-m3w5": {
    reason:
      "zod 3 (consumo de memoria con colecciones enormes). Sin arreglo en zod 3 y @insforge/sdk depende de él; " +
      "el servidor limita cada petición a 1 MB, lo que acota el riesgo. Migrar a zod 4 cuando InsForge lo soporte.",
    reviewBy: "2027-01-31"
  }
};

const BLOCKING = new Set(["high", "critical"]);

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
} catch (err) {
  // npm audit sale con código != 0 cuando encuentra algo; el JSON igual viene en stdout.
  raw = err.stdout;
}
let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error(`npm audit no devolvió un resultado legible:\n${String(raw).slice(0, 500)}`);
  process.exit(1);
}
// Si el registro de npm falló, no hubo auditoría: eso no es "sin vulnerabilidades".
if (report.error || !report.vulnerabilities || !report.metadata) {
  console.error(`npm audit no pudo completarse: ${JSON.stringify(report.error ?? report).slice(0, 500)}`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);

const blocking = [];
const accepted = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities)) {
  for (const via of vuln.via) {
    // Las entradas de texto solo dicen "viene de otro paquete": el aviso real se ve en ese paquete.
    if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
    const id = String(via.url ?? "").split("/").pop();
    const rule = ACCEPTED[id];
    const line = `${via.severity.toUpperCase()} ${name} ${via.range}: ${via.title} (${via.url})`;
    if (rule && rule.reviewBy >= today) accepted.push(`${line}\n    aceptado hasta ${rule.reviewBy}: ${rule.reason}`);
    else blocking.push(rule ? `${line}\n    la excepción venció el ${rule.reviewBy}: revisar` : line);
  }
}

if (accepted.length > 0) console.log(`Avisos aceptados temporalmente:\n${[...new Set(accepted)].join("\n")}\n`);
if (blocking.length > 0) {
  console.error(`Vulnerabilidades altas o críticas en dependencias de producción:\n${[...new Set(blocking)].join("\n")}`);
  process.exit(1);
}
console.log("Sin vulnerabilidades altas o críticas pendientes en dependencias de producción.");

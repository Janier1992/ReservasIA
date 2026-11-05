#!/usr/bin/env node
// Aplica en InsForge las migraciones de migrations/ que todavía no están
// aplicadas, por su API y sin la CLI interactiva (lo usa el workflow de
// GitHub Actions "Deploy database migrations"). Hace lo mismo que
// `npx @insforge/cli db migrations up --all`: solo aplica las posteriores a la
// última que InsForge tiene registrada, en orden, y se detiene en el primer error.
//
// Uso: INSFORGE_URL=... INSFORGE_API_KEY=... node scripts/deploy-migrations-api.mjs [--apply] [--since <versión>]
//   sin --apply   solo muestra qué se aplicaría
//   --since       primera versión a aplicar, solo si InsForge no tiene historial
//                 (proyecto donde las migraciones se corrieron a mano)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const baseUrl = (process.env.INSFORGE_URL ?? "").replace(/\/+$/, "");
const apiKey = process.env.INSFORGE_API_KEY ?? "";
if (!baseUrl || !apiKey) {
  console.error("Faltan INSFORGE_URL o INSFORGE_API_KEY.");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const sinceArg = args.includes("--since") ? (args[args.indexOf("--since") + 1] ?? "").trim() : "";
if (sinceArg && !/^\d+$/.test(sinceArg)) {
  console.error(`--since tiene que ser el número de una migración (por ejemplo 20261028090000), no "${sinceArg}".`);
  process.exit(1);
}
const since = sinceArg ? BigInt(sinceArg) : null;

const migrationsDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "migrations");
const local = readdirSync(migrationsDir)
  .map((filename) => /^(\d+)_([a-z0-9-]+)\.sql$/.exec(filename))
  .filter(Boolean)
  .map(([filename, version, name]) => ({ filename, version: BigInt(version), name }))
  .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));

async function api(pathname, init = {}) {
  return await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
  });
}

const listRes = await api("/api/database/migrations");
if (!listRes.ok) {
  console.error(`No se pudo leer el historial de migraciones de InsForge: ${listRes.status} ${(await listRes.text()).slice(0, 300)}`);
  process.exit(1);
}
const remote = ((await listRes.json()).migrations ?? []).map((m) => BigInt(m.version));
const applied = new Set(remote.map(String));
const head = remote.reduce((max, v) => (max === null || v > max ? v : max), null);

let pending;
if (head !== null) {
  console.log(`InsForge tiene ${remote.length} migraciones registradas; la última es ${head}.`);
  const skipped = local.filter((m) => !applied.has(String(m.version)) && m.version < head);
  if (skipped.length > 0) {
    // Lo normal en un proyecto donde las primeras se corrieron a mano: no se tocan.
    console.warn(`! ${skipped.length} migraciones anteriores a ${head} no figuran en InsForge; no se aplican (${skipped[skipped.length - 1].filename} es la más reciente).`);
  }
  pending = local.filter((m) => m.version > head);
} else if (since !== null) {
  console.log(`InsForge no tiene historial de migraciones: se toma desde ${since}.`);
  pending = local.filter((m) => m.version >= since);
} else {
  console.error(
    "InsForge no tiene historial de migraciones (se aplicaron a mano). Para no repetirlas todas, " +
      "corré el workflow indicando en 'desde' la primera migración que falta aplicar."
  );
  process.exit(1);
}

if (pending.length === 0) {
  console.log("No hay migraciones pendientes.");
  process.exit(0);
}
console.log(`${apply ? "Aplicando" : "Pendientes (no se aplica nada sin 'aplicar')"}:`);
for (const m of pending) console.log(`  ${m.filename}`);
if (!apply) process.exit(0);

for (const m of pending) {
  const sql = readFileSync(path.join(migrationsDir, m.filename), "utf-8");
  const res = await api("/api/database/migrations", {
    method: "POST",
    body: JSON.stringify({ version: String(m.version), name: m.name, sql })
  });
  if (!res.ok) {
    console.error(`✗ ${m.filename}: ${res.status} ${(await res.text()).slice(0, 500)}`);
    console.error("Se detuvo acá: las siguientes no se aplicaron.");
    process.exit(1);
  }
  console.log(`✓ ${m.filename}`);
}

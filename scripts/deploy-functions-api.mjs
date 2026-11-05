#!/usr/bin/env node
// Despliega las Edge Functions de functions/ a InsForge por su API, sin la CLI
// interactiva (la usa el workflow de GitHub Actions "Deploy Edge Functions").
// Hace lo mismo que `npx @insforge/cli functions deploy <slug>`: crea la
// función si no existe o actualiza su código.
//
// Uso: INSFORGE_URL=... INSFORGE_API_KEY=... node scripts/deploy-functions-api.mjs [slug ...]
// Sin slugs despliega todas. Las que importan código del repo se publican
// empaquetadas (ver function-bundle.mjs).
import { fileURLToPath } from "node:url";
import path from "node:path";
import { functionCode, listFunctions } from "./function-bundle.mjs";

const baseUrl = (process.env.INSFORGE_URL ?? "").replace(/\/+$/, "");
const apiKey = process.env.INSFORGE_API_KEY ?? "";
if (!baseUrl || !apiKey) {
  console.error("Faltan INSFORGE_URL o INSFORGE_API_KEY.");
  process.exit(1);
}

const functionsDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "functions");
const available = listFunctions(functionsDir);
const requested = process.argv.slice(2).filter(Boolean);
const unknown = requested.filter((slug) => !available.includes(slug));
if (unknown.length > 0) {
  console.error(`No existen en functions/: ${unknown.join(", ")}`);
  process.exit(1);
}
const slugs = requested.length > 0 ? requested : available;

async function api(pathname, init = {}) {
  return await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
  });
}

let failed = false;
for (const slug of slugs) {
  const code = await functionCode(functionsDir, slug);
  const exists = (await api(`/api/functions/${encodeURIComponent(slug)}`)).ok;
  const res = exists
    ? await api(`/api/functions/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify({ name: slug, description: "", code }) })
    : await api("/api/functions", { method: "POST", body: JSON.stringify({ slug, name: slug, description: "", code }) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result.deployment?.status === "failed") {
    failed = true;
    console.error(`✗ ${slug}: ${res.status} ${JSON.stringify(result).slice(0, 500)}`);
  } else {
    console.log(`✓ ${slug} ${exists ? "actualizada" : "creada"}`);
  }
}

process.exit(failed ? 1 : 0);

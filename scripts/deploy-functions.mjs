#!/usr/bin/env node
// Despliega todas las Edge Functions de functions/ a InsForge en un solo comando.
// Uso: npm run insforge:functions:deploy
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const functionsDir = path.join(rootDir, "functions");

const files = readdirSync(functionsDir).filter((f) => f.endsWith(".ts"));

if (files.length === 0) {
  console.log("No hay funciones en functions/.");
  process.exit(0);
}

let hadError = false;

for (const file of files) {
  const slug = file.replace(/\.ts$/, "");
  const filePath = path.join("functions", file);
  console.log(`\nDesplegando ${slug}...`);
  const result = spawnSync("npx", ["@insforge/cli", "functions", "deploy", slug, "--file", filePath], {
    stdio: "inherit",
    shell: true,
    cwd: rootDir
  });
  if (result.status !== 0) hadError = true;
}

process.exit(hadError ? 1 : 0);

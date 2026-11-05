#!/usr/bin/env node
// Imprime, separadas por espacio, las Edge Functions afectadas por los
// archivos que se le pasan (los que cambiaron en un push). Lo usa el workflow
// "Deploy Edge Functions" para publicar solo esas.
//
// Uso: node scripts/changed-functions.mjs $(git diff --name-only HEAD~1 HEAD)
import { fileURLToPath } from "node:url";
import path from "node:path";
import { affectedFunctions } from "./function-bundle.mjs";

const functionsDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "functions");
console.log((await affectedFunctions(functionsDir, process.argv.slice(2))).join(" "));

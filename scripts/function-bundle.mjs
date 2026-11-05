// Código que se publica de cada Edge Function. InsForge recibe un solo
// archivo por función, así que una función que importa código del repo con
// rutas relativas (por ejemplo agent-preview, que usa las instrucciones del
// agente de server/src) se empaqueta con esbuild en un único archivo. Las
// demás se publican tal cual están en functions/.
//
// Los paquetes de npm no se meten en el paquete: quedan como import
// "npm:<paquete>" para que los resuelva Deno, igual que en el resto de las
// funciones.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const RELATIVE_IMPORT = /\bfrom\s+["']\.\.?\//;

/** Deja los paquetes de npm afuera del paquete, como "npm:<paquete>". */
const npmPackagesAsDenoImports = {
  name: "npm-packages-as-deno-imports",
  setup(builder) {
    builder.onResolve({ filter: /^npm:/ }, (args) => ({ path: args.path, external: true }));
    builder.onResolve({ filter: /^[^./]/ }, (args) => ({ path: `npm:${args.path}`, external: true }));
  }
};

/** Empaqueta la función en memoria; `metafile` dice qué archivos del repo entraron. */
function bundle(functionsDir, slug) {
  return build({
    entryPoints: [path.join(functionsDir, `${slug}.ts`)],
    absWorkingDir: path.dirname(path.resolve(functionsDir)),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    metafile: true,
    charset: "utf8",
    legalComments: "none",
    plugins: [npmPackagesAsDenoImports]
  });
}

/** Las funciones son los .ts de primer nivel de functions/ (functions/_shared/ es código compartido, no una función). */
export function listFunctions(functionsDir) {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name.replace(/\.ts$/, ""))
    .sort();
}

/** Archivos del repo (rutas relativas a la raíz) que terminan dentro de la función publicada. */
export async function functionInputs(functionsDir, slug) {
  const result = await bundle(functionsDir, slug);
  return Object.keys(result.metafile.inputs).map((input) => input.split(path.sep).join("/"));
}

/**
 * Las funciones que hay que volver a publicar porque cambió alguno de los
 * archivos que usan (su propio .ts, algo de functions/_shared/ o código del
 * server que importan, como las instrucciones del agente).
 */
export async function affectedFunctions(functionsDir, changedFiles) {
  // Un cambio en este mismo archivo no publica nada solo: después de tocar el
  // empaquetado, conviene correr el workflow a mano y revisar el resultado.
  const changed = new Set(changedFiles.map((file) => file.trim()).filter(Boolean));
  const affected = [];
  for (const slug of listFunctions(functionsDir)) {
    const inputs = await functionInputs(functionsDir, slug);
    if (inputs.some((input) => changed.has(input))) affected.push(slug);
  }
  return affected;
}

/**
 * Devuelve el código a publicar de la función `slug` de `functionsDir`:
 * empaquetado si importa archivos del repo, o el archivo original si no.
 */
export async function functionCode(functionsDir, slug) {
  const source = readFileSync(path.join(functionsDir, `${slug}.ts`), "utf-8");
  if (!RELATIVE_IMPORT.test(source)) return source;

  const result = await bundle(functionsDir, slug);
  // esbuild escribe la exportación como `export { handler as default };`;
  // se deja con la misma forma que el resto de las funciones.
  const code = result.outputFiles[0].text.replace(/export \{\s*(\w+) as default\s*\};\s*$/, "export default $1;\n");
  if (!/export default \w+;\n$/.test(code)) {
    throw new Error(`${slug}: el paquete no termina en "export default <handler>;"`);
  }
  return code;
}

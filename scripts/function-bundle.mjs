// Código que se publica de cada Edge Function. InsForge recibe un solo
// archivo por función, así que una función que importa código del repo con
// rutas relativas (por ejemplo agent-preview, que usa las instrucciones del
// agente de server/src) se empaqueta con esbuild en un único archivo. Las
// demás se publican tal cual están en functions/.
//
// Los paquetes de npm no se meten en el paquete: quedan como import
// "npm:<paquete>" para que los resuelva Deno, igual que en el resto de las
// funciones.
import { readFileSync } from "node:fs";
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

/**
 * Devuelve el código a publicar de la función `slug` de `functionsDir`:
 * empaquetado si importa archivos del repo, o el archivo original si no.
 */
export async function functionCode(functionsDir, slug) {
  const file = path.join(functionsDir, `${slug}.ts`);
  const source = readFileSync(file, "utf-8");
  if (!RELATIVE_IMPORT.test(source)) return source;

  const result = await build({
    entryPoints: [file],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    charset: "utf8",
    legalComments: "none",
    plugins: [npmPackagesAsDenoImports]
  });
  // esbuild escribe la exportación como `export { handler as default };`;
  // se deja con la misma forma que el resto de las funciones.
  const code = result.outputFiles[0].text.replace(/export \{\s*(\w+) as default\s*\};\s*$/, "export default $1;\n");
  if (!/export default \w+;\n$/.test(code)) {
    throw new Error(`${slug}: el paquete no termina en "export default <handler>;"`);
  }
  return code;
}

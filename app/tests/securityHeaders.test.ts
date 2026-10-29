import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf-8");

const vercel = JSON.parse(read("vercel.json")) as { headers: { headers: { key: string; value: string }[] }[] };
const headers = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
const csp = headers["Content-Security-Policy"] ?? headers["Content-Security-Policy-Report-Only"];

describe("cabeceras de seguridad de la app (vercel.json)", () => {
  it("tiene una política de seguridad de contenido", () => {
    expect(csp).toBeTruthy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("permite exactamente los scripts en línea de index.html, por su hash", () => {
    // Si cambia el script de index.html (el que aplica el tema oscuro antes de
    // React), hay que actualizar su hash en vercel.json.
    // Los <script> sin atributos de index.html (los de Vite llevan src).
    // Normaliza CRLF -> LF: git guarda el archivo con LF (lo que recibe el
    // navegador en el deploy real), pero un checkout en Windows puede
    // convertirlo a CRLF en disco y dar un hash distinto solo por eso.
    const inline = read("index.html")
      .replace(/\r\n/g, "\n")
      .split("<script>")
      .slice(1)
      .map((part) => part.slice(0, part.indexOf("</script>")));
    expect(inline.length).toBeGreaterThan(0);
    for (const script of inline) {
      const hash = createHash("sha256").update(script).digest("base64");
      expect(csp).toContain(`'sha256-${hash}'`);
    }
    expect(csp.split(";").find((d) => d.trim().startsWith("script-src"))).not.toContain("unsafe-inline");
  });
});

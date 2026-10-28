import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf-8");

const vercel = JSON.parse(read("vercel.json")) as { headers: { headers: { key: string; value: string }[] }[] };
const headers = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
const csp = headers["Content-Security-Policy"] ?? headers["Content-Security-Policy-Report-Only"];

describe("cabeceras de seguridad de la app (vercel.json)", () => {
  it("has a content security policy", () => {
    expect(csp).toBeTruthy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows exactly the inline scripts of index.html, by hash", () => {
    // Si cambia el script de index.html (el que aplica el tema oscuro antes de
    // React), hay que actualizar su hash en vercel.json.
    const inline = [...read("index.html").matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const script of inline) {
      const hash = createHash("sha256").update(script).digest("base64");
      expect(csp).toContain(`'sha256-${hash}'`);
    }
    expect(csp.split(";").find((d) => d.trim().startsWith("script-src"))).not.toContain("unsafe-inline");
  });
});

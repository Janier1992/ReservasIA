import crypto from "node:crypto";
import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/insforge.js", () => ({ insforgeAdmin: {} }));

const { verifyState } = await import("../src/services/google/googleService.js");
const { env, DEFAULT_OAUTH_STATE_SECRET } = await import("../src/config/env.js");

function signState(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${crypto.createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

describe("verifyState (conexión con Google)", () => {
  const secret = "un-secreto-de-verdad-123";

  it("acepta un state reciente firmado con el secreto del servidor", () => {
    expect(verifyState(signState({ organizationId: "org-1", ts: Date.now() }, secret), secret)).toEqual({ organizationId: "org-1" });
  });

  it("rechaza un state firmado con otro secreto o con la firma cortada", () => {
    expect(() => verifyState(signState({ organizationId: "org-1", ts: Date.now() }, "otro"), secret)).toThrow("Estado de OAuth inválido");
    const [encoded] = signState({ organizationId: "org-1", ts: Date.now() }, secret).split(".");
    expect(() => verifyState(`${encoded}.abc`, secret)).toThrow("Estado de OAuth inválido");
  });

  it("en producción no confía en el secreto de ejemplo público", () => {
    const original = env.NODE_ENV;
    (env as { NODE_ENV: string }).NODE_ENV = "production";
    try {
      const forged = signState({ organizationId: "org-victima", ts: Date.now() }, DEFAULT_OAUTH_STATE_SECRET);
      expect(() => verifyState(forged, DEFAULT_OAUTH_STATE_SECRET)).toThrow("OAUTH_STATE_SECRET");
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = original;
    }
  });
});

describe("logger", () => {
  it("nunca escribe en los logs los secretos de webhooks de las cabeceras", async () => {
    const { REDACT_PATHS } = await import("../src/lib/logger.js");
    let out = "";
    const sink = new Writable({
      write(chunk, _enc, done) {
        out += chunk.toString();
        done();
      }
    });
    pino({ redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } }, sink).info(
      { req: { headers: { "x-telegram-bot-api-secret-token": "s3cr3t-telegram", "ycloud-signature": "t=1,s=abc", authorization: "Bearer x" } } },
      "request completed"
    );
    expect(out).not.toContain("s3cr3t-telegram");
    expect(out).not.toContain("t=1,s=abc");
    expect(out).not.toContain("Bearer x");
  });
});

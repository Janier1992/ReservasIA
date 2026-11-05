import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptCredentials, encryptCredentials } from "../src/lib/credentialsCrypto.js";
import { env } from "../src/config/env.js";

describe("credentialsCrypto", () => {
  it("cifra y descifra de vuelta el mismo objeto", () => {
    const original = { access_token: "a", refresh_token: "r", scope: "calendar" };
    const encrypted = encryptCredentials(original);
    expect(encrypted).toMatchObject({ _enc: "v1" });
    expect(encrypted).not.toHaveProperty("access_token");
    expect(decryptCredentials(encrypted)).toEqual(original);
  });

  it("usa un IV distinto en cada cifrado, aunque el contenido sea igual", () => {
    const a = encryptCredentials({ bot_token: "x" }) as { iv: string; ct: string };
    const b = encryptCredentials({ bot_token: "x" }) as { iv: string; ct: string };
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("deja pasar texto plano sin el marcador _enc (filas de antes de activar el cifrado)", () => {
    expect(decryptCredentials({ bot_token: "plano" })).toEqual({ bot_token: "plano" });
  });

  it("deja pasar {} y null/undefined sin romper", () => {
    expect(encryptCredentials({})).toEqual({});
    expect(encryptCredentials(null)).toEqual({});
    expect(decryptCredentials({})).toEqual({});
    expect(decryptCredentials(null)).toEqual({});
    expect(decryptCredentials(undefined)).toEqual({});
  });

  it("rechaza un ciphertext corrupto (tag de autenticación inválido)", () => {
    const encrypted = encryptCredentials({ api_key: "k" }) as { _enc: "v1"; iv: string; ct: string };
    const tampered = { ...encrypted, ct: Buffer.from("manipulado-manipulado-manipulado").toString("base64") };
    expect(() => decryptCredentials(tampered)).toThrow();
  });

  it("es compatible en bytes con Web Crypto (lo que usan las Edge Functions en Deno)", async () => {
    const key = await webcrypto.subtle.importKey(
      "raw",
      await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(env.INTEGRATIONS_ENCRYPTION_KEY)),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"]
    );

    // Lo que cifra el helper de Node, Web Crypto lo descifra igual.
    const encryptedByNode = encryptCredentials({ webhook_secret: "s" }) as { iv: string; ct: string };
    const decryptedByWebCrypto = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(encryptedByNode.iv, "base64") },
      key,
      Buffer.from(encryptedByNode.ct, "base64")
    );
    expect(JSON.parse(Buffer.from(decryptedByWebCrypto).toString("utf-8"))).toEqual({ webhook_secret: "s" });

    // Y lo que cifra Web Crypto, el helper de Node lo descifra igual.
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const encryptedByWebCrypto = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify({ phone_number: "+573000000000" }))
    );
    const decryptedByNode = decryptCredentials({
      _enc: "v1",
      iv: Buffer.from(iv).toString("base64"),
      ct: Buffer.from(encryptedByWebCrypto).toString("base64")
    });
    expect(decryptedByNode).toEqual({ phone_number: "+573000000000" });
  });
});

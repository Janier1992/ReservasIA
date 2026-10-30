import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, resetFakeDb } from "./stubs/fakeInsforge.js";
import { env } from "../../src/config/env.js";
import { tryDecryptCredentials } from "../../src/lib/credentialsCrypto.js";

/**
 * Conectar (o reconectar) Telegram y WhatsApp desde el panel: lo que guardan
 * las Edge Functions (InsForge) lo tiene que poder leer el server (Railway),
 * que es el que atiende los mensajes con el agente. Se prueba con claves de
 * cifrado DISTINTAS en cada lado, que es lo que pasó en producción: desde el
 * 30/10 las dos funciones guardan las credenciales sin cifrar justamente para
 * no depender de que las claves coincidan.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const ENV: Record<string, string> = {
  INSFORGE_BASE_URL: "https://insforge.test",
  API_KEY: "admin-key",
  SERVER_PUBLIC_URL: "https://server.test",
  INTEGRATIONS_ENCRYPTION_KEY: "clave-de-insforge-distinta-a-la-de-railway"
};

function seed(integrations: Record<string, unknown>[] = []) {
  resetFakeDb(
    {
      organizations: [{ id: ORG, name: "Negocio A", business_type: "barbershop", timezone: "America/Bogota", status: "active" }],
      organization_members: [{ organization_id: ORG, user_id: "user-owner", role: "owner" }],
      integrations
    },
    { "token-owner": "user-owner" }
  );
}

async function call(name: string, body: Record<string, unknown>): Promise<Response> {
  const mod = (await import(`../../../functions/${name}.ts`)) as { default: (req: Request) => Promise<Response> };
  return mod.default(
    new Request(`https://insforge.test/functions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-owner" },
      body: JSON.stringify(body)
    })
  );
}

/** Credenciales que la función guardó en integrations (la última escritura). */
function savedCredentials(): Record<string, unknown> {
  const write = fakeDb.writes.filter((w) => w.table === "integrations" && w.op === "upsert").at(-1);
  expect(write).toBeDefined();
  return (write!.payload as { credentials: Record<string, unknown> }[])[0].credentials;
}

const fetchMock = vi.fn();

beforeEach(() => {
  seed();
  vi.stubGlobal("Deno", { env: { get: (key: string) => ENV[key] } });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockTelegram() {
  fetchMock.mockImplementation(async (url: string) =>
    url.includes("/getMe") ? json({ ok: true, result: { id: 1, username: "negocio_bot", first_name: "Negocio" } }) : json({ ok: true, result: true })
  );
}

function mockYCloud() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/whatsapp/phoneNumbers")) return json({ items: [{ phoneNumber: "+573001112233", verifiedName: "Negocio A" }] });
    if (url.includes("/webhookEndpoints") && (init?.method ?? "GET") === "POST") return json({ id: "wh-nuevo", secret: "secreto-del-webhook" });
    return json({});
  });
}

describe("conectar canales desde el panel", () => {
  it("Telegram: el server lee el token que guardó la función, aunque las claves sean distintas", async () => {
    mockTelegram();
    expect((await call("telegram-connect", { organization_id: ORG, botToken: "123:abc" })).status).toBe(200);
    const credentials = savedCredentials();
    expect(env.INTEGRATIONS_ENCRYPTION_KEY).not.toBe(ENV.INTEGRATIONS_ENCRYPTION_KEY);
    expect(tryDecryptCredentials(credentials)).toEqual({ bot_token: "123:abc" });
  });

  it("WhatsApp: el server lee la API key y el secreto del webhook que guardó la función", async () => {
    mockYCloud();
    expect((await call("ycloud-connect", { organization_id: ORG, apiKey: "api-key-ycloud" })).status).toBe(200);
    expect(tryDecryptCredentials(savedCredentials())).toEqual({
      api_key: "api-key-ycloud",
      webhook_secret: "secreto-del-webhook",
      webhook_endpoint_id: "wh-nuevo"
    });
  });

  it("WhatsApp: se puede reconectar aunque la conexión anterior quedó cifrada con otra clave", async () => {
    seed([
      {
        organization_id: ORG,
        provider: "ycloud",
        status: "connected",
        credentials: { _enc: "v1", iv: "AAAAAAAAAAAAAAAA", ct: "ilegible-con-cualquier-clave" },
        metadata: { phone_number: "+573001112233" }
      }
    ]);
    mockYCloud();
    expect((await call("ycloud-connect", { organization_id: ORG, apiKey: "api-key-nueva" })).status).toBe(200);
    expect(tryDecryptCredentials(savedCredentials())).toMatchObject({ api_key: "api-key-nueva" });
  });

  it("WhatsApp: al reconectar borra el webhook anterior si la conexión anterior se puede leer", async () => {
    seed([
      {
        organization_id: ORG,
        provider: "ycloud",
        status: "connected",
        credentials: { api_key: "api-key-vieja", webhook_secret: "s", webhook_endpoint_id: "wh-viejo" },
        metadata: { phone_number: "+573001112233" }
      }
    ]);
    mockYCloud();
    expect((await call("ycloud-connect", { organization_id: ORG, apiKey: "api-key-nueva" })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/webhookEndpoints/wh-viejo"), expect.objectContaining({ method: "DELETE" }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakeDb } from "./stubs/fakeInsforge.js";

/**
 * Permisos de todas las Edge Functions (functions/): sin sesión, con una
 * sesión inválida, siendo de otro negocio y, en las de configuración, siendo
 * staff. Ninguna de estas llamadas puede llegar a tocar la base ni un
 * servicio externo.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

const ENV: Record<string, string> = {
  INSFORGE_BASE_URL: "https://insforge.test",
  API_KEY: "admin-key",
  SERVER_PUBLIC_URL: "https://server.test",
  OAUTH_STATE_SECRET: "a-test-secret-with-enough-length",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_REDIRECT_URI: "https://server.test/api/integrations/google/callback",
  OPENAI_API_KEY: "openai-key",
  GEMINI_API_KEY: "gemini-key",
  INTEGRATIONS_ENCRYPTION_KEY: "a-test-encryption-key-with-enough-length"
};

type Role = "owner" | "admin" | "staff";
interface FunctionCase {
  name: string;
  method: "GET" | "POST";
  /**
   * Quiénes la pueden usar: cualquier miembro del negocio, solo dueño o admin,
   * solo soporte de ReservasIA, o miembros y soporte.
   */
  allowed: "members" | "admins" | "support" | "membersOrSupport";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

const CASES: FunctionCase[] = [
  { name: "agent-preview", method: "POST", allowed: "admins", body: { organization_id: ORG, message: "hola" } },
  { name: "conversations-reply", method: "POST", allowed: "members", body: { organization_id: ORG, conversation_id: "conv-1", content: "hola" } },
  { name: "get-receipt-url", method: "GET", allowed: "members", query: { organization_id: ORG, message_id: "msg-1" } },
  { name: "google-disconnect", method: "POST", allowed: "admins", body: { organization_id: ORG } },
  { name: "google-oauth-start", method: "GET", allowed: "admins", query: { organization_id: ORG } },
  {
    name: "submit-subscription-payment",
    method: "POST",
    allowed: "admins",
    body: { organization_id: ORG, receipt_base64: "aGVsbG8=", receipt_mime_type: "image/jpeg", amount: 1 }
  },
  { name: "telegram-connect", method: "POST", allowed: "admins", body: { organization_id: ORG, botToken: "123:abc" } },
  { name: "telegram-disconnect", method: "POST", allowed: "admins", body: { organization_id: ORG } },
  { name: "voice-intake", method: "POST", allowed: "members", body: { organization_id: ORG, transcript: "Juan, corte mañana" } },
  { name: "ycloud-connect", method: "POST", allowed: "admins", body: { organization_id: ORG, apiKey: "key" } },
  { name: "ycloud-disconnect", method: "POST", allowed: "admins", body: { organization_id: ORG } },
  { name: "confirm-subscription-payment", method: "POST", allowed: "support", body: { payment_id: "pay-1", action: "confirm" } },
  { name: "get-subscription-receipt-url", method: "GET", allowed: "membersOrSupport", query: { payment_id: "pay-1" } }
];

const USERS = { owner: "user-owner", staff: "user-staff", outsider: "user-outsider" };

function seed() {
  resetFakeDb(
    {
      organizations: [
        { id: ORG, name: "Negocio A", business_type: "barbershop", timezone: "America/Bogota", status: "active" },
        { id: OTHER_ORG, name: "Negocio B", business_type: "barbershop", timezone: "America/Bogota", status: "active" }
      ],
      organization_members: [
        { organization_id: ORG, user_id: USERS.owner, role: "owner" },
        { organization_id: ORG, user_id: USERS.staff, role: "staff" as Role },
        { organization_id: OTHER_ORG, user_id: USERS.outsider, role: "owner" }
      ],
      support_staff: [{ user_id: "user-support", active: true }],
      subscription_payments: [{ id: "pay-1", organization_id: ORG, status: "pending", receipt_storage_path: "r.jpg" }]
    },
    { "token-owner": USERS.owner, "token-staff": USERS.staff, "token-outsider": USERS.outsider, "token-support": "user-support" }
  );
}

function request(c: FunctionCase, token?: string): Request {
  const url = new URL(`https://insforge.test/functions/${c.name}`);
  for (const [k, v] of Object.entries(c.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(url, { method: c.method, headers, body: c.method === "POST" ? JSON.stringify(c.body ?? {}) : undefined });
}

async function call(c: FunctionCase, token?: string): Promise<Response> {
  const mod = (await import(`../../../functions/${c.name}.ts`)) as { default: (req: Request) => Promise<Response> };
  return mod.default(request(c, token));
}

const fetchMock = vi.fn(async () => {
  throw new Error("Una función llamó a un servicio externo antes de revisar permisos.");
});

beforeEach(() => {
  seed();
  vi.stubGlobal("Deno", { env: { get: (key: string) => ENV[key] } });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  // Las funciones registran sus fallos con console.*: acá se esperan.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(CASES)("Edge Function $name", (c) => {
  it("responde la verificación previa de CORS del navegador", async () => {
    const mod = (await import(`../../../functions/${c.name}.ts`)) as { default: (req: Request) => Promise<Response> };
    const res = await mod.default(new Request(`https://insforge.test/functions/${c.name}`, { method: "OPTIONS" }));
    expect([200, 204]).toContain(res.status);
  });

  it("rechaza una llamada sin sesión", async () => {
    expect((await call(c)).status).toBe(401);
  });

  it("rechaza una llamada con una sesión inválida", async () => {
    expect((await call(c, "token-that-does-not-exist")).status).toBe(401);
  });

  it("rechaza a alguien de otro negocio", async () => {
    expect((await call(c, "token-outsider")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deja pasar los controles de permisos a la persona correcta", async () => {
    const token = c.allowed === "support" ? "token-support" : "token-owner";
    // Más allá de los permisos la función puede fallar por otra cosa (acá no hay
    // servicios externos); lo que importa es que no la frene la autorización.
    const status = await call(c, token).then(
      (res) => res.status,
      (err: Error) => (err.message.includes("servicio externo") || err.message.includes("librería externa") ? 0 : Promise.reject(err))
    );
    expect([401, 403]).not.toContain(status);
  });

  if (c.allowed === "admins" || c.allowed === "support") {
    it(`rechaza al staff del negocio (${c.allowed === "admins" ? "solo dueño o admin" : "solo soporte de ReservasIA"})`, async () => {
      expect((await call(c, "token-staff")).status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

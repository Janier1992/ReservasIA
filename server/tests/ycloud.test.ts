import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

const runAgentTurnMock = vi.fn();
vi.mock("../src/services/agent/agentRuntime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/agent/agentRuntime.js")>()),
  runAgentTurn: (...args: unknown[]) => runAgentTurnMock(...args)
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const SECRET = "whsec_test";

function freshInsforgeMock() {
  return createInsforgeMock({
    integrations: {
      data: { status: "connected", credentials: { api_key: "key-1", webhook_secret: SECRET }, metadata: { phone_number: "+573000000000" } },
      error: null
    },
    inbound_message_claims: { data: null, error: null },
    customers: [
      { data: null, error: null },
      { data: { id: "cust-1", organization_id: ORG, phone: "+573001112233" }, error: null }
    ],
    conversations: [
      { data: null, error: null },
      { data: { id: "conv-1", organization_id: ORG, customer_id: "cust-1", channel: "whatsapp" }, error: null }
    ],
    messages: { data: null, error: null }
  });
}

let insforgeMockInstance = freshInsforgeMock();
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { createApp } = await import("../src/app.js");
const { verifyYCloudSignature, normalizeWhatsAppPhone } = await import("../src/services/ycloud/ycloudService.js");
const { humanTakeoverActive, HUMAN_TAKEOVER_MS } = await import("../src/services/agent/agentRuntime.js");

function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},s=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** Lo que se insertó en una tabla del mock (todas las llamadas a .insert). */
function insertedInto(table: string): Record<string, unknown>[] {
  const from = insforgeMockInstance.database.from as unknown as { mock: { calls: [string][]; results: { value: { insert: { mock: { calls: unknown[][] } } } }[] } };
  return from.mock.calls.flatMap(([t], i) => (t === table ? from.mock.results[i].value.insert.mock.calls.flatMap((c) => c[0] as Record<string, unknown>[]) : []));
}

const inboundEvent = {
  id: "evt-1",
  type: "whatsapp.inbound_message.received",
  whatsappInboundMessage: {
    id: "msg-1",
    wamid: "wamid.IN1",
    from: "573001112233",
    to: "+573000000000",
    type: "text",
    text: { body: "Quiero reservar mañana" },
    customerProfile: { name: "Laura" }
  }
};

describe("verifyYCloudSignature", () => {
  const body = JSON.stringify({ hello: "world" });

  it("accepts a fresh hex or base64 HMAC of '<t>.<body>'", () => {
    const t = Math.floor(Date.now() / 1000);
    const digest = crypto.createHmac("sha256", SECRET).update(`${t}.${body}`).digest();
    expect(verifyYCloudSignature(SECRET, `t=${t},s=${digest.toString("hex")}`, body)).toBe(true);
    expect(verifyYCloudSignature(SECRET, `t=${t},s=${digest.toString("base64")}`, body)).toBe(true);
  });

  it("rejects another secret, a changed body, a stale timestamp or a missing header", () => {
    expect(verifyYCloudSignature(SECRET, sign(body, "otro"), body)).toBe(false);
    expect(verifyYCloudSignature(SECRET, sign(body), `${body} `)).toBe(false);
    expect(verifyYCloudSignature(SECRET, sign(body, SECRET, Math.floor(Date.now() / 1000) - 600), body)).toBe(false);
    expect(verifyYCloudSignature(SECRET, undefined, body)).toBe(false);
  });
});

describe("normalizeWhatsAppPhone", () => {
  it("always returns +<digits>", () => {
    expect(normalizeWhatsAppPhone("573001112233")).toBe("+573001112233");
    expect(normalizeWhatsAppPhone("whatsapp:+57 300 111 2233")).toBe("+573001112233");
  });
});

describe("humanTakeoverActive", () => {
  const now = Date.parse("2026-10-23T15:00:00Z");
  it("pauses the agent while a staff reply is recent, and only then", () => {
    const recent = new Date(now - 5 * 60 * 1000).toISOString();
    const old = new Date(now - HUMAN_TAKEOVER_MS - 1000).toISOString();
    expect(humanTakeoverActive([{ role: "staff", created_at: recent }], now)).toBe(true);
    expect(humanTakeoverActive([{ role: "staff", created_at: old }], now)).toBe(false);
    expect(humanTakeoverActive([{ role: "assistant", created_at: recent }], now)).toBe(false);
  });
});

describe("POST /api/webhooks/ycloud/:organizationId", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = freshInsforgeMock();
    runAgentTurnMock.mockResolvedValue({ reply: "¡Claro! ¿A qué hora?", roundsUsed: 1 });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "out-1", wamid: "wamid.OUT1", status: "accepted" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a delivery without a valid signature", async () => {
    const body = JSON.stringify(inboundEvent);
    const res = await request(createApp())
      .post(`/api/webhooks/ycloud/${ORG}`)
      .set("Content-Type", "application/json")
      .set("YCloud-Signature", sign(body, "otro"))
      .send(body);
    expect(res.status).toBe(403);
    expect(runAgentTurnMock).not.toHaveBeenCalled();
  });

  it("stores the customer's message, runs the agent and replies from the business number", async () => {
    const body = JSON.stringify(inboundEvent);
    const res = await request(createApp())
      .post(`/api/webhooks/ycloud/${ORG}`)
      .set("Content-Type", "application/json")
      .set("YCloud-Signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(insertedInto("messages")[0]).toMatchObject({ role: "user", content: "Quiero reservar mañana", external_message_id: "wamid.IN1" });
    expect(runAgentTurnMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, customerPhone: "+573001112233" }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("key-1");
    expect(JSON.parse(init.body as string)).toEqual({ from: "+573000000000", to: "+573001112233", type: "text", text: { body: "¡Claro! ¿A qué hora?" } });
    // El id del mensaje enviado queda reclamado: un eco suyo no pausaría al agente.
    await vi.waitFor(() =>
      expect(insertedInto("inbound_message_claims")).toEqual(expect.arrayContaining([expect.objectContaining({ external_message_id: "wamid.OUT1" })]))
    );
  });

  it("records what the business typed in its WhatsApp Business app as a staff message, without running the agent", async () => {
    const body = JSON.stringify({
      id: "evt-2",
      type: "whatsapp.smb.message.echoes",
      whatsappMessage: { id: "e-1", wamid: "wamid.ECHO1", from: "+573000000000", to: "+573001112233", type: "text", text: { body: "Hola Laura, ya te confirmo" } }
    });
    const res = await request(createApp())
      .post(`/api/webhooks/ycloud/${ORG}`)
      .set("Content-Type", "application/json")
      .set("YCloud-Signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(insertedInto("messages")).toHaveLength(1));
    expect(insertedInto("messages")[0]).toMatchObject({ role: "staff", content: "Hola Laura, ya te confirmo", external_message_id: "wamid.ECHO1" });
    expect(runAgentTurnMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

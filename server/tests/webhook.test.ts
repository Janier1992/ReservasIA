import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

const routingMock = vi.fn();
const validateSignatureMock = vi.fn();
const sendWhatsAppMessageMock = vi.fn();
const runAgentTurnMock = vi.fn();

vi.mock("../src/services/twilio/twilioService.js", () => ({
  resolveOrganizationForIncomingNumber: (...args: unknown[]) => routingMock(...args),
  validateTwilioSignature: (...args: unknown[]) => validateSignatureMock(...args),
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessageMock(...args)
}));

vi.mock("../src/services/agent/agentRuntime.js", () => ({
  runAgentTurn: (...args: unknown[]) => runAgentTurnMock(...args)
}));

function freshInsforgeMock() {
  return createInsforgeMock({
    customers: [
      { data: null, error: null },
      { data: { id: "cust-1", organization_id: "org-1", phone: "+573001112233" }, error: null }
    ],
    conversations: [
      { data: null, error: null },
      { data: { id: "conv-1", organization_id: "org-1", customer_id: "cust-1", channel: "whatsapp" }, error: null }
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

describe("POST /api/webhooks/twilio/whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = freshInsforgeMock();
    routingMock.mockResolvedValue({ organizationId: "org-1", credentials: { auth_token: "token" } });
    validateSignatureMock.mockReturnValue(true);
    runAgentTurnMock.mockResolvedValue({ reply: "¡Hola! ¿En qué te puedo ayudar?", roundsUsed: 1 });
  });

  it("rejects a payload missing the sender (From)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/webhooks/twilio/whatsapp")
      .type("form")
      .send({ To: "whatsapp:+10000000000", Body: "hola" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WEBHOOK_INVALID_PAYLOAD");
  });

  it("rejects a payload missing the body", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/webhooks/twilio/whatsapp")
      .type("form")
      .send({ From: "whatsapp:+573001112233", To: "whatsapp:+10000000000" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WEBHOOK_INVALID_PAYLOAD");
  });

  it("returns 404 when the destination number does not match any organization", async () => {
    routingMock.mockResolvedValueOnce(null);
    const app = createApp();
    const res = await request(app)
      .post("/api/webhooks/twilio/whatsapp")
      .type("form")
      .send({ From: "whatsapp:+573001112233", To: "whatsapp:+19999999999", Body: "hola" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORGANIZATION_NOT_FOUND");
  });

  it("rejects an invalid Twilio signature", async () => {
    validateSignatureMock.mockReturnValue(false);
    const app = createApp();
    const res = await request(app)
      .post("/api/webhooks/twilio/whatsapp")
      .type("form")
      .send({ From: "whatsapp:+573001112233", To: "whatsapp:+10000000000", Body: "hola" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("WEBHOOK_INVALID_SIGNATURE");
  });

  it("accepts a valid message and replies immediately with empty TwiML", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/webhooks/twilio/whatsapp")
      .type("form")
      .send({ From: "whatsapp:+573001112233", To: "whatsapp:+10000000000", Body: "Quiero reservar", MessageSid: "SM123" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("<Response");
  });
});

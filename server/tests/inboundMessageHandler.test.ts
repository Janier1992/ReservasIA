import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

let insforgeMockInstance = createInsforgeMock({});

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const findOrCreateCustomerByPhoneMock = vi.fn();
vi.mock("../src/services/customers/customersService.js", () => ({
  findOrCreateCustomerByPhone: (...args: unknown[]) => findOrCreateCustomerByPhoneMock(...args)
}));

const { handleInboundMessage, purgeOldInboundMessageClaims, INBOUND_CLAIM_RETENTION_MS } = await import(
  "../src/services/conversations/inboundMessageHandler.js"
);

const input = {
  organizationId: "org-1",
  channel: "whatsapp" as const,
  externalIdentity: "+573001112233",
  externalConversationId: "+573001112233",
  externalMessageId: "SM123",
  content: "hola"
};

// Devuelve las queries encadenadas que se abrieron sobre una tabla, para
// inspeccionar qué métodos (insert/delete/lt/...) se llamaron.
function queriesFor(table: string) {
  const from = insforgeMockInstance.database.from as ReturnType<typeof vi.fn>;
  return from.mock.calls
    .map((call, i) => ({ table: call[0] as string, query: from.mock.results[i].value as Record<string, ReturnType<typeof vi.fn>> }))
    .filter((c) => c.table === table)
    .map((c) => c.query);
}

describe("handleInboundMessage claim handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips a message another process already claimed", async () => {
    insforgeMockInstance = createInsforgeMock({
      inbound_message_claims: { data: null, error: { code: "23505", message: "duplicate key" } }
    });

    const result = await handleInboundMessage(input);

    expect(result).toEqual({ duplicate: true });
    expect(findOrCreateCustomerByPhoneMock).not.toHaveBeenCalled();
  });

  it("releases the claim when saving the message fails, so a redelivery is not dropped as a duplicate", async () => {
    insforgeMockInstance = createInsforgeMock({ inbound_message_claims: { data: null, error: null } });
    findOrCreateCustomerByPhoneMock.mockRejectedValue(new Error("db down"));

    await expect(handleInboundMessage(input)).rejects.toThrow("db down");

    const claimQueries = queriesFor("inbound_message_claims");
    expect(claimQueries).toHaveLength(2);
    expect(claimQueries[0].insert).toHaveBeenCalled();
    expect(claimQueries[1].delete).toHaveBeenCalled();
    expect(claimQueries[1].eq).toHaveBeenCalledWith("external_message_id", "SM123");
  });

  it("releases the claim when the message insert itself returns an error (the SDK does not throw)", async () => {
    insforgeMockInstance = createInsforgeMock({
      inbound_message_claims: { data: null, error: null },
      conversations: { data: { id: "conv-1", customer_id: "cust-1", status: "active" }, error: null },
      messages: { data: null, error: { message: "insert failed" } }
    });
    findOrCreateCustomerByPhoneMock.mockResolvedValue({ id: "cust-1" });

    await expect(handleInboundMessage(input)).rejects.toThrow();

    const claimQueries = queriesFor("inbound_message_claims");
    expect(claimQueries).toHaveLength(2);
    expect(claimQueries[1].delete).toHaveBeenCalled();
  });

  it("keeps the claim when the message is saved", async () => {
    insforgeMockInstance = createInsforgeMock({
      inbound_message_claims: { data: null, error: null },
      conversations: { data: { id: "conv-1", customer_id: "cust-1", status: "active" }, error: null },
      messages: { data: null, error: null }
    });
    findOrCreateCustomerByPhoneMock.mockResolvedValue({ id: "cust-1" });

    const result = await handleInboundMessage(input);

    expect(result).toEqual({ duplicate: false, conversationId: "conv-1", customerId: "cust-1" });
    const claimQueries = queriesFor("inbound_message_claims");
    expect(claimQueries).toHaveLength(1);
    expect(claimQueries[0].delete).not.toHaveBeenCalled();
  });
});

describe("purgeOldInboundMessageClaims", () => {
  it("deletes claims older than the retention window", async () => {
    insforgeMockInstance = createInsforgeMock({ inbound_message_claims: { data: null, error: null } });
    const now = new Date("2026-09-26T12:00:00Z");

    await purgeOldInboundMessageClaims(now);

    const [query] = queriesFor("inbound_message_claims");
    expect(query.delete).toHaveBeenCalled();
    expect(query.lt).toHaveBeenCalledWith("claimed_at", new Date(now.getTime() - INBOUND_CLAIM_RETENTION_MS).toISOString());
  });

  it("surfaces a database error so the scheduler logs it", async () => {
    insforgeMockInstance = createInsforgeMock({ inbound_message_claims: { data: null, error: { message: "boom" } } });
    await expect(purgeOldInboundMessageClaims()).rejects.toBeTruthy();
  });
});

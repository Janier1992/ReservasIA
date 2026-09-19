import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

let insforgeMockInstance = createInsforgeMock({});

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { ensureCustomerDetails } = await import("../src/services/customers/customersService.js");

describe("ensureCustomerDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fills in name and email when the customer has neither yet", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: [
        { data: { id: "cust-1", organization_id: "org-1", phone: "telegram:999", name: null, email: null }, error: null },
        { data: { id: "cust-1", organization_id: "org-1", phone: "telegram:999", name: "Ferley", email: "f@x.com" }, error: null }
      ]
    });

    const result = await ensureCustomerDetails("org-1", "cust-1", "Ferley", "f@x.com");
    expect(result.name).toBe("Ferley");
    expect(result.email).toBe("f@x.com");
  });

  it("never overwrites a name the customer already had", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: { data: { id: "cust-1", organization_id: "org-1", phone: "telegram:999", name: "Nombre Original", email: null }, error: null }
    });

    const result = await ensureCustomerDetails("org-1", "cust-1", "Otro Nombre");
    expect(result.name).toBe("Nombre Original");
  });

  it("throws CUSTOMER_NOT_FOUND when the conversation's customerId doesn't exist", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: { data: null, error: null }
    });

    await expect(ensureCustomerDetails("org-1", "missing-cust", "Alguien")).rejects.toThrow();
  });
});

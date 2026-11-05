import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

let insforgeMockInstance = createInsforgeMock({});

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { ensureCustomerDetails, isNewEmail } = await import("../src/services/customers/customersService.js");

describe("ensureCustomerDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completa nombre y correo cuando el cliente todavía no tiene ninguno", async () => {
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

  it("nunca reemplaza un nombre que el cliente ya tenía", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: { data: { id: "cust-1", organization_id: "org-1", phone: "telegram:999", name: "Nombre Original", email: null }, error: null }
    });

    const result = await ensureCustomerDetails("org-1", "cust-1", "Otro Nombre");
    expect(result.name).toBe("Nombre Original");
  });

  it("reemplaza el correo guardado por el que el cliente da para esta reserva", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: [
        { data: { id: "cust-1", organization_id: "org-1", phone: "telegram:999", name: "Ana", email: "vieja@x.com" }, error: null },
        { data: { id: "cust-1", organization_id: "org-1", phone: "telegram:999", name: "Ana", email: "nueva@x.com" }, error: null }
      ]
    });

    const result = await ensureCustomerDetails("org-1", "cust-1", "Ana", " nueva@x.com ");
    expect(result.email).toBe("nueva@x.com");
    const updates = (insforgeMockInstance.database.from as unknown as { mock: { results: { value: { update: { mock: { calls: unknown[][] } } } }[] } }).mock.results
      .flatMap((r) => r.value.update.mock.calls)
      .map((c) => c[0]);
    expect(updates).toEqual([{ email: "nueva@x.com" }]);
  });

  it("trata el mismo correo con otras mayúsculas o espacios como sin cambios", () => {
    expect(isNewEmail("Ana@X.com", " ana@x.com ")).toBe(false);
    expect(isNewEmail("ana@x.com", "otra@x.com")).toBe(true);
    expect(isNewEmail(null, "ana@x.com")).toBe(true);
    expect(isNewEmail("ana@x.com", undefined)).toBe(false);
  });

  it("lanza CUSTOMER_NOT_FOUND cuando el customerId de la conversación no existe", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: { data: null, error: null }
    });

    await expect(ensureCustomerDetails("org-1", "missing-cust", "Alguien")).rejects.toThrow();
  });
});

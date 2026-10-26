import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

const cancelReservationMock = vi.fn();
const rescheduleReservationMock = vi.fn();
const getReservationByIdMock = vi.fn();
const getCustomerActiveReservationsMock = vi.fn();
const getLinkedActiveReservationsMock = vi.fn();

vi.mock("../src/services/reservations/reservationsService.js", () => ({
  createReservation: vi.fn(),
  cancelReservation: (...args: unknown[]) => cancelReservationMock(...args),
  getReservationById: (...args: unknown[]) => getReservationByIdMock(...args),
  rescheduleReservation: (...args: unknown[]) => rescheduleReservationMock(...args)
}));

vi.mock("../src/services/customers/customersService.js", () => ({
  ensureCustomerDetails: vi.fn(),
  findOrCreateCustomerByPhone: vi.fn(),
  getCustomerActiveReservations: (...args: unknown[]) => getCustomerActiveReservationsMock(...args),
  getLinkedActiveReservations: (...args: unknown[]) => getLinkedActiveReservationsMock(...args)
}));

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { executeTool } = await import("../src/services/agent/toolExecutors.js");

const ctx = {
  organizationId: "org-1",
  conversationId: "conv-1",
  timezone: "America/Bogota",
  customerPhone: "telegram:111",
  customerId: "cust-me"
};

const reservation = (id: string, customerId: string, extra: Record<string, unknown> = {}) => ({
  id,
  organization_id: "org-1",
  customer_id: customerId,
  start_at: "2026-11-02T15:00:00.000Z",
  end_at: "2026-11-02T16:00:00.000Z",
  status: "confirmed",
  party_size: null,
  customer_name: "X",
  ...extra
});

describe("el agente solo ve y cambia reservas del cliente de la conversación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = createInsforgeMock({});
    getCustomerActiveReservationsMock.mockResolvedValue([reservation("res-mine", "cust-me")]);
    getLinkedActiveReservationsMock.mockResolvedValue([
      reservation("res-web", "cust-web", { notify_identity: "telegram:111", start_at: "2026-11-01T15:00:00.000Z" })
    ]);
  });

  it("ignores a phone number the customer types and lists only their own and chat-linked reservations", async () => {
    const result = await executeTool("consultar_reservas_cliente", { telefono: "+573009999999" }, ctx);
    expect(result.success).toBe(true);
    expect((result.data as { id: string }[]).map((r) => r.id)).toEqual(["res-web", "res-mine"]);
    expect(getCustomerActiveReservationsMock).toHaveBeenCalledWith("org-1", "cust-me");
    expect(getLinkedActiveReservationsMock).toHaveBeenCalledWith("org-1", "telegram:111");
  });

  it("touches no reservation when the conversation has no identified customer", async () => {
    getReservationByIdMock.mockResolvedValue(reservation("res-other", "cust-other"));
    const result = await executeTool("cancelar_reserva", { reservation_id: "11111111-1111-4111-8111-111111111111" }, { ...ctx, customerId: null });
    expect(result).toMatchObject({ success: false, error_code: "RESERVATION_NOT_FOUND" });
    expect(cancelReservationMock).not.toHaveBeenCalled();
  });

  it("refuses to cancel another customer's reservation of the same business", async () => {
    getReservationByIdMock.mockResolvedValue(reservation("res-other", "cust-other"));
    const result = await executeTool("cancelar_reserva", { reservation_id: "11111111-1111-4111-8111-111111111111" }, ctx);
    expect(result).toMatchObject({ success: false, error_code: "RESERVATION_NOT_FOUND" });
    expect(cancelReservationMock).not.toHaveBeenCalled();
  });

  it("refuses to reschedule another customer's reservation", async () => {
    getReservationByIdMock.mockResolvedValue(reservation("res-other", "cust-other"));
    const result = await executeTool(
      "reprogramar_reserva",
      { reservation_id: "11111111-1111-4111-8111-111111111111", nueva_fecha: "2026-11-03", nueva_hora: "10:00" },
      ctx
    );
    expect(result).toMatchObject({ success: false, error_code: "RESERVATION_NOT_FOUND" });
    expect(rescheduleReservationMock).not.toHaveBeenCalled();
  });

  it("still cancels the customer's own reservation and one linked to this chat", async () => {
    cancelReservationMock.mockImplementation(async (id: string) => ({ id, status: "cancelled" }));
    getReservationByIdMock.mockResolvedValueOnce(reservation("res-mine", "cust-me"));
    expect(await executeTool("cancelar_reserva", { reservation_id: "11111111-1111-4111-8111-111111111111" }, ctx)).toMatchObject({ success: true });
    getReservationByIdMock.mockResolvedValueOnce(reservation("res-web", "cust-web", { notify_identity: "telegram:111" }));
    expect(await executeTool("cancelar_reserva", { reservation_id: "22222222-2222-4222-8222-222222222222" }, ctx)).toMatchObject({ success: true });
    expect(cancelReservationMock).toHaveBeenCalledTimes(2);
  });
});

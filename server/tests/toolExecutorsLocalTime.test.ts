import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

/**
 * Las herramientas del agente le dan las horas al modelo en la zona del
 * negocio, nunca en UTC: con UTC el modelo decía que un horario de 9:00 a. m.
 * a 5:00 p. m. era "de noche" (14:00 a 22:00 UTC).
 */

const getAvailableSlotsMock = vi.fn();
const getCustomerActiveReservationsMock = vi.fn();

vi.mock("../src/services/availability/availabilityService.js", () => ({
  getAvailableSlots: (...args: unknown[]) => getAvailableSlotsMock(...args)
}));
vi.mock("../src/services/reservations/reservationsService.js", () => ({
  createReservation: vi.fn(),
  cancelReservation: vi.fn(),
  getReservationById: vi.fn(),
  rescheduleReservation: vi.fn()
}));
vi.mock("../src/services/customers/customersService.js", () => ({
  ensureCustomerDetails: vi.fn(),
  findOrCreateCustomerByPhone: vi.fn(),
  getCustomerActiveReservations: (...args: unknown[]) => getCustomerActiveReservationsMock(...args),
  getLinkedActiveReservations: vi.fn(async () => [])
}));
vi.mock("../src/lib/insforge.js", () => ({ insforgeAdmin: createInsforgeMock({}) }));

const { executeTool } = await import("../src/services/agent/toolExecutors.js");

const ctx = { organizationId: "org-1", conversationId: "conv-1", timezone: "America/Bogota", customerPhone: "telegram:1", customerId: "cust-1" };
// Sábado 31 de octubre de 2026 en Bogotá (UTC-5): 9:00, 12:00, 16:00 y 17:00 locales.
const slot = (utcHour: number) => ({
  start: `2026-10-31T${String(utcHour).padStart(2, "0")}:00:00.000Z`,
  end: `2026-10-31T${String(utcHour + 1).padStart(2, "0")}:00:00.000Z`,
  availableResourceIds: ["r1"]
});

beforeEach(() => {
  vi.clearAllMocks();
  getAvailableSlotsMock.mockResolvedValue({ slots: [slot(14), slot(17), slot(21), slot(22)], timezone: "America/Bogota" });
});

describe("horas en la zona del negocio en las herramientas del agente", () => {
  it("consultar_disponibilidad devuelve fecha, hora local y cómo decírsela al cliente", async () => {
    const result = await executeTool("consultar_disponibilidad", { fecha: "2026-10-31" }, ctx);
    const data = result.data as { slots: { fecha: string; hora: string; cuando: string; hasta: string }[] };
    expect(data.slots[0]).toEqual({ fecha: "2026-10-31", hora: "09:00", cuando: "sábado 31 de octubre a las 9:00 a. m.", hasta: "10:00 a. m.", availableResourceIds: ["r1"] });
    expect(data.slots.map((s) => s.hora)).toEqual(["09:00", "12:00", "16:00", "17:00"]);
    expect(JSON.stringify(data)).not.toContain("T14:00:00");
  });

  it("ordena por cercanía a la hora que pidió el cliente, en hora local", async () => {
    const result = await executeTool("consultar_disponibilidad", { fecha: "2026-10-31", hora_preferida: "16:30" }, ctx);
    const data = result.data as { slots: { hora: string }[] };
    expect(data.slots[0].hora).toBe("16:00");
  });

  it("consultar_reservas_cliente dice la reserva en hora local", async () => {
    getCustomerActiveReservationsMock.mockResolvedValue([
      { id: "res-1", organization_id: "org-1", customer_id: "cust-1", start_at: "2026-11-02T15:00:00.000Z", end_at: "2026-11-02T16:00:00.000Z", status: "confirmed", party_size: 2, customer_name: "Laura" }
    ]);
    const result = await executeTool("consultar_reservas_cliente", {}, ctx);
    expect(result.data).toEqual([
      expect.objectContaining({ id: "res-1", fecha: "2026-11-02", hora: "10:00", cuando: "lunes 2 de noviembre a las 10:00 a. m.", hasta: "11:00 a. m." })
    ]);
  });
});

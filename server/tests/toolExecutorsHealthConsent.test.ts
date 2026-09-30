import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

// Regla dura de datos de salud (Ley 1581): en consultorios, clínicas y
// fisioterapia el motivo de consulta que el modelo mande en `notas` NO se
// guarda si el paciente no autorizó, sin importar lo que decida el modelo.
const createReservationMock = vi.fn();
const ensureCustomerDetailsMock = vi.fn();

vi.mock("../src/services/reservations/reservationsService.js", () => ({
  createReservation: (...args: unknown[]) => createReservationMock(...args),
  cancelReservation: vi.fn(),
  getReservationById: vi.fn(),
  rescheduleReservation: vi.fn()
}));

vi.mock("../src/services/customers/customersService.js", () => ({
  ensureCustomerDetails: (...args: unknown[]) => ensureCustomerDetailsMock(...args),
  findOrCreateCustomerByPhone: vi.fn(),
  getCustomerActiveReservations: vi.fn()
}));

let businessType = "dental";
let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { executeTool } = await import("../src/services/agent/toolExecutors.js");

const ctx = { organizationId: "org-1", conversationId: "conv-1", timezone: "America/Bogota", customerPhone: "+573000000001", customerId: "cust-1" };
const args = { fecha: "2026-10-05", hora: "10:00", nombre_cliente: "Ana", telefono_cliente: "+573000000001", notas: "Dolor de muela desde hace 3 días" };

describe("crear_reserva y la autorización de datos de salud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = createInsforgeMock({
      business_profiles: {
        data: { reservation_duration_minutes: 30, deposit_enabled: false, deposit_mandatory: false, deposit_percentage: null, nequi_phone: null },
        error: null
      },
      organizations: () => ({ data: { business_type: businessType }, error: null })
    });
    createReservationMock.mockImplementation(async (input: { startAt: Date; endAt: Date }) => ({
      id: "res-1",
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
      status: "confirmed"
    }));
  });

  it("no guarda el motivo de consulta de un paciente que no autorizó, y se lo avisa al agente", async () => {
    businessType = "dental";
    ensureCustomerDetailsMock.mockResolvedValue({ id: "cust-1", health_data_consent_at: null });

    const result = await executeTool("crear_reserva", args, ctx);

    expect(result.success).toBe(true);
    expect(createReservationMock.mock.calls[0][0].specialRequests).toBeNull();
    expect((result.data as { notas_no_guardadas?: string }).notas_no_guardadas).toBeTruthy();
  });

  it("guarda el motivo si el paciente autorizó", async () => {
    businessType = "clinic";
    ensureCustomerDetailsMock.mockResolvedValue({ id: "cust-1", health_data_consent_at: "2026-09-30T10:00:00Z" });

    const result = await executeTool("crear_reserva", args, ctx);

    expect(createReservationMock.mock.calls[0][0].specialRequests).toBe(args.notas);
    expect((result.data as { notas_no_guardadas?: string }).notas_no_guardadas).toBeUndefined();
  });

  it("no afecta a otros rubros (ni a la veterinaria)", async () => {
    for (const type of ["barbershop", "veterinary"]) {
      businessType = type;
      createReservationMock.mockClear();
      ensureCustomerDetailsMock.mockResolvedValue({ id: "cust-1", health_data_consent_at: null });
      await executeTool("crear_reserva", { ...args, notas: "Mesa junto a la ventana" }, ctx);
      expect(createReservationMock.mock.calls[0][0].specialRequests).toBe("Mesa junto a la ventana");
    }
  });
});

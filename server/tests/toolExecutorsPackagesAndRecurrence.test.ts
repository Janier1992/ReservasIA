import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

const createReservationMock = vi.fn();
const ensureCustomerDetailsMock = vi.fn();
const findOrCreateCustomerByPhoneMock = vi.fn();

vi.mock("../src/services/reservations/reservationsService.js", () => ({
  createReservation: (...args: unknown[]) => createReservationMock(...args),
  cancelReservation: vi.fn(),
  getReservationById: vi.fn(),
  rescheduleReservation: vi.fn()
}));

vi.mock("../src/services/customers/customersService.js", () => ({
  ensureCustomerDetails: (...args: unknown[]) => ensureCustomerDetailsMock(...args),
  findOrCreateCustomerByPhone: (...args: unknown[]) => findOrCreateCustomerByPhoneMock(...args),
  getCustomerActiveReservations: vi.fn()
}));

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { executeTool } = await import("../src/services/agent/toolExecutors.js");
const { AppError } = await import("../src/utils/AppError.js");

const ctx = {
  organizationId: "org-1",
  conversationId: "conv-1",
  timezone: "America/Bogota",
  customerPhone: "+573000000001",
  customerId: "cust-1"
};

describe("crear_reserva con repetir_semanas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = createInsforgeMock({
      business_profiles: {
        data: { reservation_duration_minutes: 60, deposit_enabled: false, deposit_mandatory: false, deposit_percentage: null, nequi_phone: null },
        error: null
      }
    });
    ensureCustomerDetailsMock.mockResolvedValue({ id: "cust-1" });
  });

  it("reserva cada semana de la serie bajo el mismo recurrence group cuando todas están disponibles", async () => {
    createReservationMock.mockImplementation(async (input: { startAt: Date; endAt: Date }) => ({
      id: `res-${input.startAt.toISOString()}`,
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
      status: "confirmed"
    }));

    const result = await executeTool(
      "crear_reserva",
      { fecha: "2026-10-05", hora: "10:00", nombre_cliente: "Ana", telefono_cliente: "+573000000001", repetir_semanas: 3 },
      ctx
    );

    expect(result.success).toBe(true);
    const data = result.data as { recurrente: boolean; ocurrencias: { reservada: boolean; fecha: string }[] };
    expect(data.recurrente).toBe(true);
    expect(data.ocurrencias).toHaveLength(3);
    expect(data.ocurrencias.every((o) => o.reservada)).toBe(true);
    expect(createReservationMock).toHaveBeenCalledTimes(3);

    const recurrenceGroupIds = createReservationMock.mock.calls.map((c) => c[0].recurrenceGroupId);
    expect(new Set(recurrenceGroupIds).size).toBe(1);

    const weeks = createReservationMock.mock.calls.map((c) => (c[0].startAt as Date).getTime());
    expect(weeks[1] - weeks[0]).toBe(7 * 24 * 60 * 60 * 1000);
    expect(weeks[2] - weeks[1]).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("informa qué semana falló sin abortar el resto de la serie", async () => {
    let call = 0;
    createReservationMock.mockImplementation(async (input: { startAt: Date; endAt: Date }) => {
      call += 1;
      if (call === 2) throw new AppError("RESERVATION_NOT_AVAILABLE", "El horario solicitado ya no está disponible.", 409);
      return { id: `res-${call}`, start_at: input.startAt.toISOString(), end_at: input.endAt.toISOString(), status: "confirmed" };
    });

    const result = await executeTool(
      "crear_reserva",
      { fecha: "2026-10-05", hora: "10:00", nombre_cliente: "Ana", telefono_cliente: "+573000000001", repetir_semanas: 3 },
      ctx
    );

    expect(result.success).toBe(true);
    const data = result.data as { ocurrencias: { reservada: boolean; motivo?: string }[] };
    expect(data.ocurrencias[0].reservada).toBe(true);
    expect(data.ocurrencias[1].reservada).toBe(false);
    expect(data.ocurrencias[1].motivo).toContain("disponible");
    expect(data.ocurrencias[2].reservada).toBe(true);
    expect(createReservationMock).toHaveBeenCalledTimes(3);
  });
});

describe("crear_reserva con paquete_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = createInsforgeMock({
      business_profiles: {
        data: { reservation_duration_minutes: 60, deposit_enabled: false, deposit_mandatory: false, deposit_percentage: null, nequi_phone: null },
        error: null
      }
    });
    ensureCustomerDetailsMock.mockResolvedValue({ id: "cust-1" });
  });

  it("pasa paquete_id a createReservation como customerPackageId", async () => {
    createReservationMock.mockResolvedValueOnce({
      id: "res-1",
      start_at: "2026-10-05T15:00:00.000Z",
      end_at: "2026-10-05T16:00:00.000Z",
      status: "confirmed"
    });

    const result = await executeTool(
      "crear_reserva",
      {
        fecha: "2026-10-05",
        hora: "10:00",
        nombre_cliente: "Ana",
        telefono_cliente: "+573000000001",
        paquete_id: "22222222-2222-2222-2222-222222222222"
      },
      ctx
    );

    expect(result.success).toBe(true);
    expect(createReservationMock).toHaveBeenCalledTimes(1);
    expect(createReservationMock.mock.calls[0][0].customerPackageId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("propaga el error del RPC cuando el paquete ya se agotó", async () => {
    createReservationMock.mockRejectedValueOnce(new AppError("PACKAGE_EXHAUSTED", "El cliente ya usó todas las sesiones de ese paquete.", 422));

    const result = await executeTool(
      "crear_reserva",
      {
        fecha: "2026-10-05",
        hora: "10:00",
        nombre_cliente: "Ana",
        telefono_cliente: "+573000000001",
        paquete_id: "22222222-2222-2222-2222-222222222222"
      },
      ctx
    );

    expect(result.success).toBe(false);
    expect(result.error_code).toBe("PACKAGE_EXHAUSTED");
  });
});

describe("consultar_paquetes_cliente", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve los paquetes activos con sesiones restantes calculadas sobre reservas no canceladas", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: { data: { id: "cust-1" }, error: null },
      customer_packages: { data: [{ id: "pkg-1", package_name: "10 sesiones de fisioterapia", sessions_total: 10 }], error: null },
      reservations: { data: [{ id: "r1" }, { id: "r2" }, { id: "r3" }], error: null }
    });

    const result = await executeTool("consultar_paquetes_cliente", {}, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ id: "pkg-1", nombre: "10 sesiones de fisioterapia", sesiones_totales: 10, sesiones_restantes: 7 }]);
  });

  it("no devuelve un paquete ya agotado", async () => {
    insforgeMockInstance = createInsforgeMock({
      customers: { data: { id: "cust-1" }, error: null },
      customer_packages: { data: [{ id: "pkg-1", package_name: "5 sesiones", sessions_total: 5 }], error: null },
      reservations: { data: [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }, { id: "r5" }], error: null }
    });

    const result = await executeTool("consultar_paquetes_cliente", {}, ctx);

    expect(result.data).toEqual([]);
  });

  it("devuelve una lista vacía cuando el cliente todavía no existe", async () => {
    insforgeMockInstance = createInsforgeMock({ customers: { data: null, error: null } });

    const result = await executeTool("consultar_paquetes_cliente", {}, ctx);

    expect(result.data).toEqual([]);
  });
});

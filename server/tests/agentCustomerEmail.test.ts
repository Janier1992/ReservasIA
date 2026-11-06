import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

/**
 * El correo que el cliente da por chat tiene que quedar guardado: un correo
 * con un punto final o un espacio no puede tumbar la reserva (antes el agente
 * la volvía a crear sin correo, en silencio), y si lo da después de reservar
 * se guarda con guardar_email_cliente y se le manda la confirmación.
 */
const createReservationMock = vi.fn();
const ensureCustomerDetailsMock = vi.fn();
const findOrCreateCustomerByPhoneMock = vi.fn();
const getCustomerActiveReservationsMock = vi.fn();
const announceMock = vi.fn();

vi.mock("../src/services/reservations/reservationsService.js", () => ({
  createReservation: (...args: unknown[]) => createReservationMock(...args),
  announceReservationToNewEmail: (...args: unknown[]) => announceMock(...args),
  cancelReservation: vi.fn(),
  getReservationById: vi.fn(),
  rescheduleReservation: vi.fn()
}));

vi.mock("../src/services/customers/customersService.js", () => ({
  ensureCustomerDetails: (...args: unknown[]) => ensureCustomerDetailsMock(...args),
  findOrCreateCustomerByPhone: (...args: unknown[]) => findOrCreateCustomerByPhoneMock(...args),
  getCustomerActiveReservations: (...args: unknown[]) => getCustomerActiveReservationsMock(...args),
  getLinkedActiveReservations: vi.fn(async () => [])
}));

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { executeTool } = await import("../src/services/agent/toolExecutors.js");
const { normalizeEmail, getToolDefinitionsForAgent } = await import("../src/services/agent/tools.js");

const ctx = { organizationId: "org-1", conversationId: "conv-1", timezone: "America/Bogota", customerPhone: "+573000000001", customerId: "cust-1" };
const reservationArgs = { fecha: "2026-11-07", hora: "15:00", nombre_cliente: "Javier", telefono_cliente: "+573000000001" };

describe("normalizeEmail", () => {
  it("limpia lo que se pega al dictar un correo por chat", () => {
    expect(normalizeEmail("Javier@Gmail.com.")).toBe("javier@gmail.com");
    expect(normalizeEmail(" javier @gmail.com ")).toBe("javier@gmail.com");
    expect(normalizeEmail("<javier@gmail.com>")).toBe("javier@gmail.com");
    expect(normalizeEmail("mailto:javier@gmail.com")).toBe("javier@gmail.com");
    expect(normalizeEmail("(javier@gmail.com),")).toBe("javier@gmail.com");
  });

  it("devuelve null si no es un correo", () => {
    for (const bad of ["", "   ", "javier", "javier@", "no tengo", "N/A"]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("crear_reserva con el correo del cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = createInsforgeMock({
      business_profiles: {
        data: { reservation_duration_minutes: 30, deposit_enabled: false, deposit_mandatory: false, deposit_percentage: null, nequi_phone: null },
        error: null
      },
      organizations: { data: { business_type: "barbershop" }, error: null }
    });
    ensureCustomerDetailsMock.mockResolvedValue({ id: "cust-1", health_data_consent_at: null });
    createReservationMock.mockImplementation(async (input: { startAt: Date; endAt: Date }) => ({
      id: "res-1",
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
      status: "confirmed"
    }));
  });

  it("guarda el correo aunque venga con punto final y mayúsculas", async () => {
    const result = await executeTool("crear_reserva", { ...reservationArgs, email_cliente: "Javier@Gmail.com." }, ctx);

    expect(result.success).toBe(true);
    expect(ensureCustomerDetailsMock).toHaveBeenCalledWith("org-1", "cust-1", "Javier", "javier@gmail.com");
  });

  it("un correo inválido no frena la reserva: se crea y el agente recibe el aviso", async () => {
    const result = await executeTool("crear_reserva", { ...reservationArgs, email_cliente: "javier arroba gmail" }, ctx);

    expect(result.success).toBe(true);
    expect(createReservationMock).toHaveBeenCalledTimes(1);
    expect(ensureCustomerDetailsMock).toHaveBeenCalledWith("org-1", "cust-1", "Javier", undefined);
    expect((result.data as { email_no_guardado?: string }).email_no_guardado).toMatch(/guardar_email_cliente/);
  });

  it("los opcionales que el modelo manda en null no tumban la reserva", async () => {
    const result = await executeTool(
      "crear_reserva",
      { ...reservationArgs, email_cliente: null, cantidad_personas: null, notas: null, metodo_pago: null, service_id: null },
      ctx
    );
    expect(result.success).toBe(true);
    expect(createReservationMock).toHaveBeenCalledTimes(1);
  });

  it("un correo vacío no genera aviso", async () => {
    const result = await executeTool("crear_reserva", { ...reservationArgs, email_cliente: "" }, ctx);
    expect(result.success).toBe(true);
    expect((result.data as { email_no_guardado?: string }).email_no_guardado).toBeUndefined();
  });
});

describe("guardar_email_cliente", () => {
  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    ensureCustomerDetailsMock.mockResolvedValue({ id: "cust-1", email: "javier@gmail.com" });
    getCustomerActiveReservationsMock.mockResolvedValue([
      { id: "res-futura", start_at: future, status: "confirmed" },
      { id: "res-pasada", start_at: past, status: "confirmed" }
    ]);
    announceMock.mockResolvedValue(true);
  });

  it("guarda el correo y manda la confirmación solo de las reservas que vienen", async () => {
    const result = await executeTool("guardar_email_cliente", { email: "Javier@gmail.com." }, ctx);

    expect(result.success).toBe(true);
    expect(ensureCustomerDetailsMock).toHaveBeenCalledWith("org-1", "cust-1", undefined, "javier@gmail.com");
    expect(announceMock).toHaveBeenCalledTimes(1);
    expect(announceMock.mock.calls[0][0].id).toBe("res-futura");
    expect(result.data).toEqual({ email_guardado: "javier@gmail.com", reservas_confirmadas_por_correo: 1 });
  });

  it("rechaza un correo inválido sin tocar la ficha", async () => {
    const result = await executeTool("guardar_email_cliente", { email: "javier" }, ctx);

    expect(result.success).toBe(false);
    expect(result.error_code).toBe("VALIDATION_ERROR");
    expect(ensureCustomerDetailsMock).not.toHaveBeenCalled();
  });

  it("se le ofrece al agente fuera de la vista previa", () => {
    const config = { booking_enabled: true, cancellation_enabled: false, rescheduling_enabled: false } as never;
    const names = (tools: { function: { name: string } }[]) => tools.map((t) => t.function.name);
    expect(names(getToolDefinitionsForAgent(config) as never)).toContain("guardar_email_cliente");
    expect(names(getToolDefinitionsForAgent(config, { previewMode: true }) as never)).not.toContain("guardar_email_cliente");
  });
});

describe("errores de validación", () => {
  it("le dicen al modelo qué campo corregir", async () => {
    const result = await executeTool("crear_reserva", { fecha: "mañana", hora: "10:00", nombre_cliente: "Javier" }, ctx);
    expect(result.success).toBe(false);
    expect(result.error_code).toBe("VALIDATION_ERROR");
    expect(result.message).toMatch(/fecha: fecha debe tener formato YYYY-MM-DD/);
    expect(result.message).toMatch(/no le digas al cliente/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

/**
 * Reservas en el server (reservationsService): cómo se traducen los errores
 * de la base a mensajes para el cliente, la reprogramación con su aviso y
 * el paso del anticipo a "esperando confirmación". La creación y la
 * cancelación con sus avisos están en reservationSync.test.ts.
 */

const sendReservationEmailMock = vi.fn();
const updateCalendarEventMock = vi.fn();

vi.mock("../src/services/notifications/reservationEmailService.js", () => ({
  sendReservationEmail: (...args: unknown[]) => sendReservationEmailMock(...args)
}));
vi.mock("../src/services/google/googleService.js", () => ({
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEventMock(...args)
}));
vi.mock("../src/services/notifications/pushService.js", () => ({ notifyNewReservation: vi.fn() }));

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { createReservation, getReservationById, markAwaitingPaymentAsAwaitingConfirmation, rescheduleReservation } = await import(
  "../src/services/reservations/reservationsService.js"
);

const reservation = (extra: Record<string, unknown> = {}) => ({
  id: "res-1",
  organization_id: "org-1",
  customer_id: "cust-1",
  start_at: "2030-01-10T15:00:00.000Z",
  end_at: "2030-01-10T16:00:00.000Z",
  status: "confirmed",
  google_event_id: null,
  ...extra
});

const input = {
  organizationId: "org-1",
  customerId: "cust-1",
  serviceId: null,
  resourceId: null,
  conversationId: null,
  startAt: new Date("2030-01-10T15:00:00.000Z"),
  endAt: new Date("2030-01-10T16:00:00.000Z"),
  partySize: null,
  customerName: "Laura",
  specialRequests: null
};

describe("reservas en el server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendReservationEmailMock.mockResolvedValue(true);
  });

  it.each([
    ["RESERVATION_NOT_AVAILABLE", 409, "El horario solicitado ya no está disponible."],
    ["TIME_BLOCKED", 409, "Ese horario está bloqueado en la agenda del negocio."],
    ["RESERVATION_IN_PAST", 422, "No se puede reservar en el pasado."],
    ["SERVICE_NOT_FOUND", 422, "El servicio seleccionado no existe."]
  ])("traduce el error %s de la base a un mensaje claro para el cliente", async (dbError, status, message) => {
    insforgeMockInstance = createInsforgeMock({}, { book_reservation: { data: null, error: { message: `ERROR: ${dbError}` } } });
    await expect(createReservation(input)).rejects.toMatchObject({ statusCode: status, message });
  });

  it("un error desconocido de la base no se muestra tal cual al cliente", async () => {
    insforgeMockInstance = createInsforgeMock({}, { book_reservation: { data: null, error: { message: "connection reset at 10.0.0.3" } } });
    await expect(createReservation(input)).rejects.toMatchObject({
      statusCode: 500,
      message: "No se pudo completar la operación de reserva."
    });
  });

  it("al reprogramar avisa al cliente y mueve el evento de Google Calendar sin invitarlo dos veces", async () => {
    insforgeMockInstance = createInsforgeMock(
      {},
      { reschedule_reservation: { data: reservation({ google_event_id: "evt-1", start_at: "2030-01-11T15:00:00.000Z" }), error: null } }
    );
    const moved = await rescheduleReservation("res-1", new Date("2030-01-11T15:00:00.000Z"), new Date("2030-01-11T16:00:00.000Z"));
    expect(moved.start_at).toBe("2030-01-11T15:00:00.000Z");
    expect(sendReservationEmailMock).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }), "rescheduled");
    expect(updateCalendarEventMock).toHaveBeenCalledWith(expect.objectContaining({ google_event_id: "evt-1" }), { notifyCustomer: false });
  });

  it("si falla Google Calendar al reprogramar, la reserva igual queda reprogramada", async () => {
    insforgeMockInstance = createInsforgeMock({}, { reschedule_reservation: { data: reservation({ google_event_id: "evt-1" }), error: null } });
    updateCalendarEventMock.mockRejectedValueOnce(new Error("Google caído"));
    await expect(
      rescheduleReservation("res-1", new Date("2030-01-11T15:00:00.000Z"), new Date("2030-01-11T16:00:00.000Z"))
    ).resolves.toMatchObject({ id: "res-1" });
  });

  it("cuando llega el comprobante, pasa la reserva a esperando confirmación del negocio (nunca a pagada)", async () => {
    insforgeMockInstance = createInsforgeMock({
      reservations: [
        { data: reservation({ payment_status: "awaiting_payment" }), error: null },
        { data: reservation({ payment_status: "awaiting_confirmation" }), error: null }
      ]
    });
    const updated = await markAwaitingPaymentAsAwaitingConfirmation("org-1", "cust-1");
    expect(updated?.payment_status).toBe("awaiting_confirmation");
    const updateCalls = insforgeMockInstance.database.from.mock.results
      .map((r) => r.value as { update: ReturnType<typeof vi.fn> })
      .flatMap((query) => query.update.mock.calls);
    expect(updateCalls).toEqual([[{ payment_status: "awaiting_confirmation" }]]);
  });

  it("si el cliente no tiene ninguna reserva esperando pago, no cambia nada", async () => {
    insforgeMockInstance = createInsforgeMock({ reservations: { data: null, error: null } });
    expect(await markAwaitingPaymentAsAwaitingConfirmation("org-1", "cust-1")).toBeNull();
  });

  it("buscar una reserva de otro negocio o inexistente da 'la reserva no existe'", async () => {
    insforgeMockInstance = createInsforgeMock({ reservations: { data: null, error: null } });
    await expect(getReservationById("org-1", "res-x")).rejects.toMatchObject({ statusCode: 404, message: "La reserva no existe." });
    insforgeMockInstance = createInsforgeMock({ reservations: { data: reservation(), error: null } });
    await expect(getReservationById("org-1", "res-1")).resolves.toMatchObject({ id: "res-1" });
  });
});

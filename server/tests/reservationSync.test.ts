import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock, type TableResponse } from "./helpers/insforgeMock.js";

const sendReservationEmailMock = vi.fn();
const createCalendarEventMock = vi.fn();
const deleteCalendarEventMock = vi.fn();

vi.mock("../src/services/notifications/reservationEmailService.js", () => ({
  sendReservationEmail: (...args: unknown[]) => sendReservationEmailMock(...args)
}));
vi.mock("../src/services/google/googleService.js", () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEventMock(...args),
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEventMock(...args),
  updateCalendarEvent: vi.fn()
}));
vi.mock("../src/services/notifications/pushService.js", () => ({ notifyNewReservation: vi.fn() }));

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { cancelReservation, createReservation } = await import("../src/services/reservations/reservationsService.js");
const { syncPanelReservations } = await import("../src/services/reservations/reservationSyncScheduler.js");

const reservation = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organization_id: "org-1",
  customer_id: "cust-1",
  start_at: "2026-11-02T15:00:00.000Z",
  end_at: "2026-11-02T16:00:00.000Z",
  status: "confirmed",
  source: "dashboard",
  google_event_id: null,
  ...extra
});

const claimed = (id: string) => ({ data: [{ id }], error: null });
const notClaimed = { data: [], error: null };

function useDatabase(reservations: TableResponse, rpc: Record<string, TableResponse> = {}) {
  insforgeMockInstance = createInsforgeMock({ reservations }, rpc);
}

const input = {
  organizationId: "org-1",
  customerId: "cust-1",
  serviceId: null,
  resourceId: null,
  conversationId: null,
  startAt: new Date("2026-11-02T15:00:00.000Z"),
  endAt: new Date("2026-11-02T16:00:00.000Z"),
  partySize: null,
  customerName: "Laura",
  specialRequests: null,
  source: "telegram"
};

describe("aviso al cliente de reservas creadas o canceladas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendReservationEmailMock.mockResolvedValue(true);
    createCalendarEventMock.mockResolvedValue(null);
  });

  it("por el chat, envía el correo y sincroniza Calendar una vez marcada la reserva", async () => {
    useDatabase([claimed("res-1")], { book_reservation: { data: reservation("res-1", { source: "telegram" }), error: null } });
    await createReservation(input);
    expect(sendReservationEmailMock).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }), "confirmed");
    expect(createCalendarEventMock).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }), { notifyCustomer: false });
  });

  it("por el chat, envía el correo aunque no se pueda guardar la marca", async () => {
    useDatabase([{ data: null, error: { message: "column created_sync_at does not exist" } }], {
      book_reservation: { data: reservation("res-1", { source: "telegram" }), error: null }
    });
    await createReservation(input);
    expect(sendReservationEmailMock).toHaveBeenCalledTimes(1);
  });

  it("no vuelve a escribir al cancelar una reserva que ya estaba cancelada y avisada", async () => {
    useDatabase([notClaimed], { cancel_reservation: { data: reservation("res-1", { status: "cancelled" }), error: null } });
    await cancelReservation("res-1");
    expect(sendReservationEmailMock).not.toHaveBeenCalled();
    expect(deleteCalendarEventMock).not.toHaveBeenCalled();
  });

  it("avisa una reserva creada desde el panel", async () => {
    useDatabase([{ data: [reservation("res-1")], error: null }, claimed("res-1"), { data: [], error: null }]);
    const result = await syncPanelReservations();
    expect(result).toEqual({ created: 1, cancelled: 0 });
    expect(sendReservationEmailMock).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }), "confirmed");
    expect(createCalendarEventMock).toHaveBeenCalledTimes(1);
  });

  it("omite una reserva del panel que otra instancia ya avisó", async () => {
    useDatabase([{ data: [reservation("res-1")], error: null }, notClaimed, { data: [], error: null }]);
    expect(await syncPanelReservations()).toEqual({ created: 0, cancelled: 0 });
    expect(sendReservationEmailMock).not.toHaveBeenCalled();
  });

  it("nunca reintenta en bucle cuando falla la marca", async () => {
    useDatabase([{ data: [reservation("res-1")], error: null }, { data: null, error: { message: "boom" } }, { data: [], error: null }]);
    expect(await syncPanelReservations()).toEqual({ created: 0, cancelled: 0 });
    expect(sendReservationEmailMock).not.toHaveBeenCalled();
  });

  it("no avisa nada de una reserva del panel creada y cancelada antes de la revisión", async () => {
    useDatabase([{ data: [reservation("res-1", { status: "cancelled" })], error: null }, claimed("res-1"), claimed("res-1"), { data: [], error: null }]);
    expect(await syncPanelReservations()).toEqual({ created: 0, cancelled: 0 });
    expect(sendReservationEmailMock).not.toHaveBeenCalled();
  });

  it("avisa una cancelación hecha desde el panel y borra el evento de Calendar", async () => {
    useDatabase([
      { data: [], error: null },
      { data: [reservation("res-2", { status: "cancelled", source: "telegram", google_event_id: "evt-1" })], error: null },
      claimed("res-2")
    ]);
    expect(await syncPanelReservations()).toEqual({ created: 0, cancelled: 1 });
    expect(sendReservationEmailMock).toHaveBeenCalledWith(expect.objectContaining({ id: "res-2" }), "cancelled");
    expect(deleteCalendarEventMock).toHaveBeenCalledWith("org-1", "evt-1", { notifyCustomer: false });
  });

  it("no hace nada cuando no se puede leer la base", async () => {
    useDatabase({ data: null, error: { message: "column created_sync_at does not exist" } });
    expect(await syncPanelReservations()).toEqual({ created: 0, cancelled: 0 });
    expect(sendReservationEmailMock).not.toHaveBeenCalled();
  });
});

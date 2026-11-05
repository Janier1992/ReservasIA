import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Cuando el cliente da su correo después de reservar: primero el correo del
 * negocio; si no sale (por ejemplo, InsForge sin envío habilitado), Google
 * Calendar lo invita al evento como respaldo.
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
vi.mock("../src/lib/alerts.js", () => ({ reportFailure: vi.fn() }));
vi.mock("../src/lib/insforge.js", () => ({ insforgeAdmin: {} }));

const { announceReservationToNewEmail } = await import("../src/services/reservations/reservationsService.js");

const reservation = { id: "res-1", organization_id: "org-1", google_event_id: "evt-1" } as never;

describe("announceReservationToNewEmail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("si sale el correo del negocio, no toca Google", async () => {
    sendReservationEmailMock.mockResolvedValue(true);
    expect(await announceReservationToNewEmail(reservation)).toBe(true);
    expect(updateCalendarEventMock).not.toHaveBeenCalled();
  });

  it("si el correo no sale, invita al cliente desde Google Calendar", async () => {
    sendReservationEmailMock.mockResolvedValue(false);
    updateCalendarEventMock.mockResolvedValue(undefined);
    expect(await announceReservationToNewEmail(reservation)).toBe(true);
    expect(updateCalendarEventMock).toHaveBeenCalledWith(reservation, { notifyCustomer: true });
  });

  it("sin correo ni evento de Google, avisa que no pudo", async () => {
    sendReservationEmailMock.mockResolvedValue(false);
    expect(await announceReservationToNewEmail({ ...(reservation as object), google_event_id: null } as never)).toBe(false);
  });

  it("si Google falla, no rompe la conversación", async () => {
    sendReservationEmailMock.mockResolvedValue(false);
    updateCalendarEventMock.mockRejectedValue(new Error("invalid_grant"));
    expect(await announceReservationToNewEmail(reservation)).toBe(false);
  });
});

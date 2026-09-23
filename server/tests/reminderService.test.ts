import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

let insforgeMockInstance = createInsforgeMock({});
const sendTelegramMessageMock = vi.fn(async () => {});
const sendWhatsAppMessageMock = vi.fn(async () => {});

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));
vi.mock("../src/services/telegram/telegramService.js", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args)
}));
vi.mock("../src/services/twilio/twilioService.js", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessageMock(...args)
}));

const { sendDueReservationReminders, buildReminderText } = await import("../src/services/reminders/reminderService.js");

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    reservation_id: "res-1",
    organization_id: "org-1",
    customer_id: "cust-1",
    customer_phone: "telegram:555",
    customer_name: "Camila",
    service_name: "Corte",
    start_at: "2026-09-23T15:00:00.000Z",
    timezone: "America/Bogota",
    business_name: "Barbería El Corte",
    ...overrides
  };
}

describe("buildReminderText", () => {
  it("includes the customer name, service, business name and formatted time", () => {
    const text = buildReminderText(makeRow());
    expect(text).toContain("Camila");
    expect(text).toContain("Corte");
    expect(text).toContain("Barbería El Corte");
  });

  it("falls back to a generic greeting when there is no customer name", () => {
    const text = buildReminderText(makeRow({ customer_name: null }));
    expect(text).toContain("¡Hola!");
  });
});

describe("sendDueReservationReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when there are no due reservations", async () => {
    insforgeMockInstance = createInsforgeMock({}, { get_due_reservation_reminders: { data: [], error: null } });
    const result = await sendDueReservationReminders();
    expect(result).toEqual({ total: 0, sent: 0 });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
  });

  it("sends via Telegram when the customer phone has the telegram: prefix, and marks it sent", async () => {
    insforgeMockInstance = createInsforgeMock(
      {
        integrations: { data: { credentials: { bot_token: "bot-token-1" } }, error: null },
        reservations: { data: null, error: null }
      },
      { get_due_reservation_reminders: { data: [makeRow()], error: null } }
    );

    const result = await sendDueReservationReminders();

    expect(sendTelegramMessageMock).toHaveBeenCalledWith("bot-token-1", "555", expect.any(String));
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, sent: 1 });
  });

  it("sends via WhatsApp when the customer phone is a plain number", async () => {
    insforgeMockInstance = createInsforgeMock(
      { reservations: { data: null, error: null } },
      { get_due_reservation_reminders: { data: [makeRow({ customer_phone: "+573001112233" })], error: null } }
    );

    await sendDueReservationReminders();

    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith("org-1", "+573001112233", expect.any(String));
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("skips a Telegram reminder without marking it sent when no bot is connected", async () => {
    insforgeMockInstance = createInsforgeMock(
      { integrations: { data: null, error: null } },
      { get_due_reservation_reminders: { data: [makeRow()], error: null } }
    );

    const result = await sendDueReservationReminders();

    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, sent: 0 });
  });

  it("keeps processing the rest of the batch when one reservation fails to send", async () => {
    sendTelegramMessageMock.mockRejectedValueOnce(new Error("Telegram down"));
    insforgeMockInstance = createInsforgeMock(
      {
        integrations: { data: { credentials: { bot_token: "bot-token-1" } }, error: null },
        reservations: { data: null, error: null }
      },
      {
        get_due_reservation_reminders: {
          data: [makeRow({ reservation_id: "res-1" }), makeRow({ reservation_id: "res-2" })],
          error: null
        }
      }
    );

    const result = await sendDueReservationReminders();

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ total: 2, sent: 1 });
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

let insforgeMockInstance = createInsforgeMock({});
const sendTelegramMessageMock = vi.fn(async () => {});
const sendWhatsAppReminderTemplateMock = vi.fn(async () => "sent" as const);

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));
vi.mock("../src/services/telegram/telegramService.js", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args)
}));
vi.mock("../src/services/twilio/twilioService.js", () => ({
  sendTwilioWhatsAppReminderTemplate: (...args: unknown[]) => sendWhatsAppReminderTemplateMock(...args)
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
  it("incluye el nombre del cliente, el servicio, el negocio y la hora con formato", () => {
    const text = buildReminderText(makeRow());
    expect(text).toContain("Camila");
    expect(text).toContain("Corte");
    expect(text).toContain("Barbería El Corte");
  });

  it("usa un saludo genérico cuando no hay nombre del cliente", () => {
    const text = buildReminderText(makeRow({ customer_name: null }));
    expect(text).toContain("¡Hola!");
  });
});

describe("sendDueReservationReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada cuando no hay reservas por recordar", async () => {
    insforgeMockInstance = createInsforgeMock({}, { get_due_reservation_reminders: { data: [], error: null } });
    const result = await sendDueReservationReminders();
    expect(result).toEqual({ total: 0, sent: 0 });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(sendWhatsAppReminderTemplateMock).not.toHaveBeenCalled();
  });

  it("envía por Telegram cuando el teléfono del cliente tiene el prefijo telegram:, y lo marca como enviado", async () => {
    insforgeMockInstance = createInsforgeMock(
      {
        integrations: { data: { credentials: { bot_token: "bot-token-1" } }, error: null },
        reservations: { data: null, error: null }
      },
      { get_due_reservation_reminders: { data: [makeRow()], error: null } }
    );

    const result = await sendDueReservationReminders();

    expect(sendTelegramMessageMock).toHaveBeenCalledWith("bot-token-1", "555", expect.any(String));
    expect(sendWhatsAppReminderTemplateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, sent: 1 });
  });

  it("usa el chat que el cliente vinculó desde la página de reservas en vez del teléfono del formulario", async () => {
    insforgeMockInstance = createInsforgeMock(
      {
        integrations: { data: { credentials: { bot_token: "bot-token-1" } }, error: null },
        reservations: [{ data: [{ id: "res-1", notify_identity: "telegram:999" }], error: null }, { data: null, error: null }]
      },
      { get_due_reservation_reminders: { data: [makeRow({ customer_phone: "+573001112233" })], error: null } }
    );

    const result = await sendDueReservationReminders();

    expect(sendTelegramMessageMock).toHaveBeenCalledWith("bot-token-1", "999", expect.stringContaining("Camila"));
    expect(sendWhatsAppReminderTemplateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, sent: 1 });
  });

  it("escribe la fecha del recordatorio en español", () => {
    expect(buildReminderText(makeRow())).toContain("miércoles 23 de septiembre");
  });

  it("envía con la plantilla de recordatorio de WhatsApp (nunca texto libre) cuando el teléfono del cliente es un número común", async () => {
    insforgeMockInstance = createInsforgeMock(
      { reservations: { data: null, error: null } },
      { get_due_reservation_reminders: { data: [makeRow({ customer_phone: "+573001112233" })], error: null } }
    );

    const result = await sendDueReservationReminders();

    expect(sendWhatsAppReminderTemplateMock).toHaveBeenCalledWith(
      "org-1",
      "+573001112233",
      expect.objectContaining({ "1": "Camila", "2": "Barbería El Corte" })
    );
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, sent: 1 });
  });

  it("omite un recordatorio de WhatsApp sin marcarlo como enviado cuando el negocio todavía no tiene plantilla aprobada", async () => {
    sendWhatsAppReminderTemplateMock.mockResolvedValueOnce("no_template_configured");
    insforgeMockInstance = createInsforgeMock(
      { reservations: { data: null, error: null } },
      { get_due_reservation_reminders: { data: [makeRow({ customer_phone: "+573001112233" })], error: null } }
    );

    const result = await sendDueReservationReminders();

    expect(result).toEqual({ total: 1, sent: 0 });
  });

  it("si el negocio atiende solo por Telegram y el cliente dejó su número, no intenta WhatsApp ni lo marca como enviado", async () => {
    const { AppError, ErrorCodes } = await import("../src/utils/AppError.js");
    sendWhatsAppReminderTemplateMock.mockRejectedValueOnce(new AppError(ErrorCodes.INTEGRATION_NOT_CONNECTED, "WhatsApp no está conectado.", 409));
    insforgeMockInstance = createInsforgeMock(
      { reservations: { data: null, error: null } },
      { get_due_reservation_reminders: { data: [makeRow({ customer_phone: "+573001112233" })], error: null } }
    );

    expect(await sendDueReservationReminders()).toEqual({ total: 1, sent: 0 });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("con YCloud conectado, el recordatorio de WhatsApp sale por la plantilla de YCloud", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m-1", status: "accepted" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    insforgeMockInstance = createInsforgeMock(
      {
        integrations: {
          data: {
            status: "connected",
            credentials: { api_key: "key-1", webhook_secret: "whsec" },
            metadata: { phone_number: "+573000000000", waba_id: "waba-1", reminder_template: { status: "APPROVED", checked_at: new Date().toISOString() } }
          },
          error: null
        },
        inbound_message_claims: { data: null, error: null },
        reservations: { data: null, error: null }
      },
      { get_due_reservation_reminders: { data: [makeRow({ customer_phone: "+573001112233" })], error: null } }
    );

    expect(await sendDueReservationReminders()).toEqual({ total: 1, sent: 1 });
    expect(sendWhatsAppReminderTemplateMock).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly");
    expect(JSON.parse(init.body as string)).toMatchObject({ type: "template", to: "+573001112233" });
    vi.unstubAllGlobals();
  });

  it("omite un recordatorio de Telegram sin marcarlo como enviado cuando no hay bot conectado", async () => {
    insforgeMockInstance = createInsforgeMock(
      { integrations: { data: null, error: null } },
      { get_due_reservation_reminders: { data: [makeRow()], error: null } }
    );

    const result = await sendDueReservationReminders();

    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, sent: 0 });
  });

  it("sigue con el resto del lote cuando falla el envío de una reserva", async () => {
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

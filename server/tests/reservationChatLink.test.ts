import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createInsforgeMock, type TableResponse } from "./helpers/insforgeMock.js";

let db: ReturnType<typeof createInsforgeMock>;
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return db;
  }
}));

const { createReservationChatLink, linkReservationByCode, buildReservationLinkedText } = await import("../src/services/chatLink/reservationLink.js");
const { extractOrderCode } = await import("../src/services/chatLink/notifyLinks.js");
const { handleOrderCodeMessage } = await import("../src/services/publicOrders/publicOrderService.js");

const ok = (data: unknown) => ({ data, error: null });
function useDb(tables: Record<string, TableResponse>) {
  db = createInsforgeMock(tables);
}
/** Lo que el servicio mandó a update() en una tabla (primer update). */
function updatedIn(table: string): Record<string, unknown> | undefined {
  const mock = (db.database.from as unknown as { mock: { calls: [string][]; results: { value: { update: { mock: { calls: unknown[][] } } } }[] } }).mock;
  for (let i = 0; i < mock.calls.length; i++) {
    if (mock.calls[i][0] !== table) continue;
    const call = mock.results[i].value.update.mock.calls[0];
    if (call) return call[0] as Record<string, unknown>;
  }
  return undefined;
}

const msg = { organizationId: "org-1", code: "ABCDE23456", channel: "telegram" as const, identity: "telegram:77", customerId: "c-1", conversationId: "conv-1" };
const NOW = new Date("2026-10-04T12:00:00Z");

beforeEach(() => useDb({}));

describe("reservation codes from WhatsApp", () => {
  it("reads 'Reserva #<código>' as well as 'Pedido #<código>'", () => {
    expect(extractOrderCode("Reserva #abcde23456")).toBe("ABCDE23456");
    expect(extractOrderCode("Hola, Reserva # ABCDE23456 gracias")).toBe("ABCDE23456");
    expect(extractOrderCode("quiero hacer una reserva para mañana")).toBeNull();
  });
});

describe("createReservationChatLink", () => {
  it("gives the reservation a code and links only to the connected channels", async () => {
    useDb({ integrations: ok([{ provider: "telegram", metadata: { bot_username: "BarberiaBot" } }]), reservations: ok(null) });
    const links = await createReservationChatLink("org-1", "res-1");
    const code = (updatedIn("reservations") as { notify_code: string }).notify_code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(links).toEqual({ telegramUrl: `https://t.me/BarberiaBot?start=${code}`, whatsappUrl: null });
  });

  it("offers WhatsApp with a 'Reserva #' message", async () => {
    useDb({ integrations: ok([{ provider: "twilio", metadata: { whatsapp_number: "whatsapp:+57 300 555 1234" } }]), reservations: ok(null) });
    const links = await createReservationChatLink("org-1", "res-1");
    expect(links.whatsappUrl).toMatch(/^https:\/\/wa\.me\/573005551234\?text=Reserva%20%23[A-Z2-9]{10}$/);
  });

  it("skips the code when the business has no chat channel connected", async () => {
    useDb({ integrations: ok([]) });
    expect(await createReservationChatLink("org-1", "res-1")).toEqual({ telegramUrl: null, whatsappUrl: null });
    expect(updatedIn("reservations")).toBeUndefined();
  });
});

describe("linkReservationByCode", () => {
  const reservation = {
    id: "res-1",
    customer_name: "Camila Rojas",
    status: "confirmed",
    start_at: "2026-10-10T15:00:00Z",
    services: { name: "Corte clásico" },
    customers: null
  };

  it("links the chat and confirms the appointment in Spanish", async () => {
    useDb({
      reservations: [ok(reservation), ok(null)],
      organizations: ok({ timezone: "America/Bogota" }),
      business_profiles: ok({ name: "Barbería El Corte" }),
      messages: ok(null)
    });
    expect(await linkReservationByCode(msg, NOW)).toBe(
      "¡Hola Camila! Tu reserva de Corte clásico en Barbería El Corte quedó confirmada para el sábado 10 de octubre a las 10:00 a.m. Te recordamos por acá antes de la cita. Si necesitás cambiarla o cancelarla, escribinos."
    );
    expect(updatedIn("reservations")).toEqual({ notify_channel: "telegram", notify_identity: "telegram:77" });
  });

  it("does not link a reservation that already happened or was cancelled", async () => {
    useDb({ reservations: ok({ ...reservation, status: "cancelled" }), messages: ok(null) });
    expect(await linkReservationByCode(msg, NOW)).toMatch(/ya no está activa/);
    expect(updatedIn("reservations")).toBeUndefined();
  });

  it("returns null when the code is not a reservation", async () => {
    useDb({ reservations: ok(null) });
    expect(await linkReservationByCode(msg, NOW)).toBeNull();
  });

  it("is what an order code falls back to when there is no order with that code", async () => {
    useDb({
      walk_ins: ok(null),
      reservations: [ok({ ...reservation, start_at: "2099-01-01T15:00:00Z" }), ok(null)],
      organizations: ok({ timezone: "America/Bogota" }),
      business_profiles: ok({ name: "Barbería El Corte" }),
      messages: ok(null)
    });
    expect(await handleOrderCodeMessage(msg)).toMatch(/^¡Hola Camila! Tu reserva de Corte clásico en Barbería El Corte quedó confirmada/);
  });
});

describe("buildReservationLinkedText", () => {
  it("works without names", () => {
    expect(buildReservationLinkedText(null, null, "", "2026-10-10T15:00:00Z", "America/Bogota")).toMatch(/^¡Hola! Tu reserva quedó confirmada para el sábado 10 de octubre/);
  });
});

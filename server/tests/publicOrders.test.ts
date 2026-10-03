import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock, type TableResponse } from "./helpers/insforgeMock.js";

let db: ReturnType<typeof createInsforgeMock>;
const sendTelegramMessageMock = vi.fn();

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return db;
  }
}));
vi.mock("../src/services/telegram/telegramService.js", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args),
  loadConnectedTelegramBotToken: async () => "bot-token"
}));
vi.mock("../src/services/twilio/twilioService.js", () => ({ sendWhatsAppMessage: vi.fn() }));

const { buildOrderReadyText, createPublicOrder, extractOrderCode, formatTicket, generateOrderCode, handleOrderCodeMessage, mergeOrderItems, orderTotal, summarizeOrderItems } = await import(
  "../src/services/publicOrders/publicOrderService.js"
);
const { sendReadyOrderNotifications } = await import("../src/services/publicOrders/orderReadyNotifier.js");
const { publicPageMode } = await import("../src/services/publicBooking/publicBookingService.js");

const ok = (data: unknown) => ({ data, error: null });
const restaurant = { id: "org-1", slug: "antojitos", business_type: "restaurant", timezone: "America/Bogota", status: "active", disabled_modules: [] };

function useDb(tables: Record<string, TableResponse>) {
  db = createInsforgeMock(tables);
}

beforeEach(() => sendTelegramMessageMock.mockReset());

describe("order codes", () => {
  it("generates 10-character codes without ambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(generateOrderCode()).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });

  it("reads the code from Telegram /start and WhatsApp 'Pedido #'", () => {
    expect(extractOrderCode("/start ABCDE23456")).toBe("ABCDE23456");
    expect(extractOrderCode("Pedido #abcde23456")).toBe("ABCDE23456");
    expect(extractOrderCode("/start")).toBeNull();
    expect(extractOrderCode("quiero hacer un pedido rapidamente")).toBeNull();
    expect(extractOrderCode("hola, ¿tienen hamburguesas?")).toBeNull();
  });
});

describe("publicPageMode", () => {
  it("uses immediate orders only for restaurants with on-site service on", () => {
    expect(publicPageMode("restaurant", [])).toBe("order");
    expect(publicPageMode("restaurant", ["walk_ins"])).toBe("booking");
    expect(publicPageMode("spa", [])).toBe("booking");
  });
});

/** El objeto que el servicio insertó en una tabla (primer insert). */
function insertedInto(table: string): Record<string, unknown> | undefined {
  const results = (db.database.from as unknown as { mock: { calls: [string][]; results: { value: { insert: { mock: { calls: unknown[][] } } } }[] } }).mock;
  for (let i = 0; i < results.calls.length; i++) {
    if (results.calls[i][0] !== table) continue;
    const call = results.results[i].value.insert.mock.calls[0];
    if (call) return (call[0] as Record<string, unknown>[])[0];
  }
  return undefined;
}

const burger = { id: "svc-1", name: "Hamburguesa", price: 18000, currency: "COP" };
const lemonade = { id: "svc-2", name: "Limonada", price: 6000, currency: "COP" };

describe("createPublicOrder", () => {
  it("queues the order and offers only the connected channels", async () => {
    useDb({
      organizations: ok(restaurant),
      services: ok([burger]),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z", ticket_number: 14 }), ok([{ id: "w-0" }, { id: "w-1" }])],
      integrations: ok([{ provider: "telegram", metadata: { bot_username: "AntojitosBot" } }])
    });
    const order = await createPublicOrder("antojitos", { items: [{ serviceId: "svc-1", quantity: 1 }], name: "Ana Ruiz" });
    expect(order).toMatchObject({ position: 2, ticketNumber: 14, serviceName: "Hamburguesa", whatsappUrl: null, total: 18000, currency: "COP" });
    expect(order.telegramUrl).toBe(`https://t.me/AntojitosBot?start=${order.code}`);
    expect(insertedInto("walk_ins")).toMatchObject({ service_id: "svc-1", source: "qr" });
  });

  it("takes several products with quantities and stores them as a snapshot", async () => {
    useDb({
      organizations: ok(restaurant),
      services: ok([burger, lemonade]),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z" }), ok([{ id: "w-1" }])],
      integrations: ok([])
    });
    const order = await createPublicOrder("antojitos", {
      items: [
        { serviceId: "svc-1", quantity: 1 },
        { serviceId: "svc-2", quantity: 1 },
        { serviceId: "svc-1", quantity: 1 }
      ],
      name: "Ana Ruiz",
      notes: "sin cebolla"
    });
    expect(order).toMatchObject({
      serviceName: "2× Hamburguesa y Limonada",
      items: [
        { name: "Hamburguesa", quantity: 2 },
        { name: "Limonada", quantity: 1 }
      ],
      total: 42000,
      currency: "COP"
    });
    expect(insertedInto("walk_ins")).toMatchObject({
      service_id: null,
      notes: "sin cebolla",
      order_items: [
        { service_id: "svc-1", name: "Hamburguesa", quantity: 2, unit_price: 18000, currency: "COP" },
        { service_id: "svc-2", name: "Limonada", quantity: 1, unit_price: 6000, currency: "COP" }
      ]
    });
  });

  it("rejects the order when a product is no longer on the menu", async () => {
    useDb({ organizations: ok(restaurant), services: ok([burger]) });
    await expect(
      createPublicOrder("antojitos", {
        items: [
          { serviceId: "svc-1", quantity: 1 },
          { serviceId: "svc-9", quantity: 1 }
        ],
        name: "Ana"
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects quantities above the limit once merged", async () => {
    useDb({ organizations: ok(restaurant), services: ok([burger]) });
    await expect(
      createPublicOrder("antojitos", {
        items: [
          { serviceId: "svc-1", quantity: 15 },
          { serviceId: "svc-1", quantity: 10 }
        ],
        name: "Ana"
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects businesses whose public page is for bookings", async () => {
    useDb({ organizations: ok({ ...restaurant, business_type: "spa" }) });
    await expect(createPublicOrder("spa", { items: [{ serviceId: "svc-1", quantity: 1 }], name: "Ana" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("order helpers", () => {
  it("merges repeated products", () => {
    expect(
      mergeOrderItems([
        { serviceId: "a", quantity: 1 },
        { serviceId: "b", quantity: 2 },
        { serviceId: "a", quantity: 3 }
      ])
    ).toEqual([
      { serviceId: "a", quantity: 4 },
      { serviceId: "b", quantity: 2 }
    ]);
  });

  it("summarizes orders in plain Spanish", () => {
    expect(summarizeOrderItems(null)).toBe("");
    expect(summarizeOrderItems([{ name: "Limonada", quantity: 1 }])).toBe("Limonada");
    expect(
      summarizeOrderItems([
        { name: "Hamburguesa", quantity: 2 },
        { name: "Papas", quantity: 1 },
        { name: "Limonada", quantity: 3 }
      ])
    ).toBe("2× Hamburguesa, Papas y 3× Limonada");
  });

  it("has no total when a product has no price or currencies differ", () => {
    const item = { service_id: "a", name: "A", quantity: 2, unit_price: 1000, currency: "COP" };
    expect(orderTotal([item])).toEqual({ total: 2000, currency: "COP" });
    expect(orderTotal([item, { ...item, unit_price: null }])).toEqual({ total: null, currency: null });
    expect(orderTotal([item, { ...item, currency: "USD" }])).toEqual({ total: null, currency: null });
  });
});

describe("handleOrderCodeMessage", () => {
  const msg = { organizationId: "org-1", code: "ABCDE23456", channel: "telegram" as const, identity: "telegram:77", customerId: "c-1", conversationId: "conv-1" };

  it("links the chat to an active order and confirms", async () => {
    useDb({
      walk_ins: [ok({ id: "w-1", customer_id: null, customer_name: "Ana Ruiz", status: "waiting", ticket_number: 3, services: { name: "Hamburguesa" } }), ok(null)],
      messages: ok(null)
    });
    expect(await handleOrderCodeMessage(msg)).toBe(
      "¡Hola Ana! Recibimos tu pedido #003 de Hamburguesa. Te escribimos por acá apenas esté listo para reclamar."
    );
  });

  it("confirms every product of a multi-product order", async () => {
    useDb({
      walk_ins: [
        ok({
          id: "w-1",
          customer_id: null,
          customer_name: "Ana Ruiz",
          status: "waiting",
          services: null,
          order_items: [
            { service_id: "svc-1", name: "Hamburguesa", quantity: 2, unit_price: 18000, currency: "COP" },
            { service_id: "svc-2", name: "Limonada", quantity: 1, unit_price: 6000, currency: "COP" }
          ]
        }),
        ok(null)
      ],
      messages: ok(null)
    });
    expect(await handleOrderCodeMessage(msg)).toBe(
      "¡Hola Ana! Recibimos tu pedido de 2× Hamburguesa y Limonada. Te escribimos por acá apenas esté listo para reclamar."
    );
  });

  it("explains when the order is not active", async () => {
    useDb({ walk_ins: ok({ id: "w-1", customer_id: null, customer_name: "Ana", status: "done", services: null }), messages: ok(null) });
    expect(await handleOrderCodeMessage(msg)).toMatch(/No encontramos un pedido activo/);
  });
});

describe("sendReadyOrderNotifications", () => {
  const ready = { id: "w-1", organization_id: "org-1", customer_name: "Ana Ruiz", notify_channel: "telegram", notify_identity: "telegram:77", services: { name: "Hamburguesa" } };

  it("claims each ready order once and messages the customer's chat", async () => {
    useDb({
      walk_ins: [ok([ready]), ok([{ id: "w-1" }])],
      business_profiles: ok({ name: "Antojitos" }),
      conversations: ok({ id: "conv-1" }),
      messages: ok(null)
    });
    expect(await sendReadyOrderNotifications()).toEqual({ sent: 1, failed: 0 });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("bot-token", "77", "¡Ana, tu pedido de Hamburguesa está listo! Acercate a reclamarlo en Antojitos.");
  });

  it("lists every product in the ready message", async () => {
    useDb({
      walk_ins: [
        ok([{ ...ready, services: null, order_items: [{ service_id: "svc-1", name: "Hamburguesa", quantity: 2, unit_price: 18000, currency: "COP" }, { service_id: "svc-2", name: "Limonada", quantity: 1, unit_price: 6000, currency: "COP" }] }]),
        ok([{ id: "w-1" }])
      ],
      business_profiles: ok({ name: "Antojitos" }),
      conversations: ok({ id: "conv-1" }),
      messages: ok(null)
    });
    await sendReadyOrderNotifications();
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("bot-token", "77", "¡Ana, tu pedido de 2× Hamburguesa y Limonada está listo! Acercate a reclamarlo en Antojitos.");
  });

  it("skips orders another instance already claimed", async () => {
    useDb({ walk_ins: [ok([ready]), ok([])] });
    expect(await sendReadyOrderNotifications()).toEqual({ sent: 0, failed: 0 });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("records a failed delivery instead of retrying forever", async () => {
    sendTelegramMessageMock.mockRejectedValueOnce(new Error("Forbidden: bot was blocked by the user"));
    useDb({ walk_ins: [ok([ready]), ok([{ id: "w-1" }]), ok(null)], business_profiles: ok({ name: "Antojitos" }) });
    expect(await sendReadyOrderNotifications()).toEqual({ sent: 0, failed: 1 });
  });

  it("writes a friendly ready message even without names", () => {
    expect(buildOrderReadyText(null, null, "")).toBe("¡Tu pedido está listo! Acercate a reclamarlo.");
  });

  it("names the ticket so the customer can claim it", () => {
    expect(formatTicket(7)).toBe("#007");
    expect(formatTicket(null)).toBe("");
    expect(buildOrderReadyText("Ana Ruiz", "Hamburguesa", "Antojitos", 14)).toBe(
      "¡Ana, tu pedido #014 de Hamburguesa está listo! Acercate a reclamarlo en Antojitos con tu ticket #014."
    );
  });
});

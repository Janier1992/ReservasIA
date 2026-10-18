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

const { buildOrderReadyText, cleanForNames, createPublicOrder, extractOrderCode, formatTicket, generateOrderCode, handleOrderCodeMessage, mergeOrderItems, orderTotal, summarizeOrderItems } = await import(
  "../src/services/publicOrders/publicOrderService.js"
);
const { sendReadyOrderNotifications } = await import("../src/services/publicOrders/orderReadyNotifier.js");
const { getPublicBusiness, publicPageMode } = await import("../src/services/publicBooking/publicBookingService.js");

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

describe("public menu of the day", () => {
  const profile = { name: "Antojitos", description: null, address: null, phone: null, logo_url: null, max_booking_days: 30 };
  const menu = [
    { id: "svc-1", name: "Hamburguesa", description: null, duration_minutes: 15, price: 18000, currency: "COP", available_days: null },
    { id: "svc-2", name: "Sopa de mondongo", description: null, duration_minutes: 15, price: 16000, currency: "COP", available_days: [1, 4] }
  ];
  const saturday = new Date("2026-10-10T17:00:00Z");
  const monday = new Date("2026-10-12T17:00:00Z");

  it("shows only today's products on the QR order page", async () => {
    useDb({ organizations: ok(restaurant), business_profiles: ok(profile), services: ok(menu) });
    expect((await getPublicBusiness("antojitos", saturday)).services.map((s) => s.name)).toEqual(["Hamburguesa"]);
    useDb({ organizations: ok(restaurant), business_profiles: ok(profile), services: ok(menu) });
    expect((await getPublicBusiness("antojitos", monday)).services.map((s) => s.name)).toEqual(["Hamburguesa", "Sopa de mondongo"]);
  });

  it("keeps today's sold-out products visible but marked, and forgets it the next day", async () => {
    const soldOut = [{ ...menu[0], sold_out_on: "2026-10-10" }];
    useDb({ organizations: ok(restaurant), business_profiles: ok(profile), services: ok(soldOut) });
    expect((await getPublicBusiness("antojitos", saturday)).services[0].soldOut).toBe(true);
    useDb({ organizations: ok(restaurant), business_profiles: ok(profile), services: ok(soldOut) });
    expect((await getPublicBusiness("antojitos", monday)).services[0].soldOut).toBeUndefined();
  });

  it("leaves booking pages of other businesses untouched", async () => {
    useDb({ organizations: ok({ ...restaurant, business_type: "spa" }), business_profiles: ok(profile), services: ok(menu) });
    expect((await getPublicBusiness("spa", saturday)).services).toHaveLength(2);
  });
});

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

  it("keeps what each dish includes and who each portion is for", async () => {
    const lunch = { id: "svc-3", name: "Almuerzo ejecutivo", description: "Sopa de mondongo, arroz, carne asada y jugo", price: 20000, currency: "COP" };
    useDb({
      organizations: ok(restaurant),
      services: ok([lunch]),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z" }), ok([{ id: "w-1" }])],
      integrations: ok([])
    });
    const order = await createPublicOrder("antojitos", {
      items: [{ serviceId: "svc-3", quantity: 3, forNames: [" Ana ", "", "Luis", "Pedro", "Sobra"] }],
      name: "Ana Ruiz"
    });
    expect(insertedInto("walk_ins")).toMatchObject({
      order_items: [
        { name: "Almuerzo ejecutivo", quantity: 3, includes: "Sopa de mondongo, arroz, carne asada y jugo", for_names: ["Ana", "Luis", "Pedro"] }
      ]
    });
    expect(order.items).toEqual([{ name: "Almuerzo ejecutivo", quantity: 3, forNames: ["Ana", "Luis", "Pedro"] }]);
  });

  it("takes something that is not on the menu, written by the customer, with the price to confirm", async () => {
    useDb({
      organizations: ok(restaurant),
      services: ok([burger]),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z" }), ok([{ id: "w-1" }])],
      integrations: ok([])
    });
    const order = await createPublicOrder("antojitos", {
      items: [{ serviceId: "svc-1", quantity: 1 }],
      customItems: [{ name: "  Arepa   con queso ", quantity: 2, forNames: ["Ana"] }],
      name: "Ana Ruiz"
    });
    expect(insertedInto("walk_ins")).toMatchObject({
      service_id: null,
      order_items: [
        { service_id: "svc-1", name: "Hamburguesa", unit_price: 18000 },
        { service_id: null, name: "Arepa con queso", quantity: 2, unit_price: null, currency: null, custom: true, for_names: ["Ana"] }
      ]
    });
    // Con algo sin precio, el total lo confirma el negocio.
    expect(order).toMatchObject({ serviceName: "Hamburguesa y 2× Arepa con queso", total: null });
  });

  it("adds a written-in dish with its price to the menu and links the order to it", async () => {
    useDb({
      organizations: ok(restaurant),
      // 1) productos del pedido, 2) carta para buscar el nombre, 3) producto nuevo creado
      services: [ok([burger]), ok([burger]), ok({ id: "svc-new", name: "Bandeja especial", description: "frijoles, chicharrón y huevo", price: 25000, currency: "COP" })],
      business_profiles: ok({ currency: "COP" }),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z" }), ok([{ id: "w-1" }])],
      integrations: ok([])
    });
    const order = await createPublicOrder("antojitos", {
      items: [{ serviceId: "svc-1", quantity: 1 }],
      customItems: [{ name: "Bandeja especial", quantity: 2, includes: " frijoles,  chicharrón y huevo ", unitPrice: 25000 }],
      name: "Ana"
    });
    expect(insertedInto("services")).toMatchObject({
      organization_id: "org-1",
      name: "Bandeja especial",
      description: "frijoles, chicharrón y huevo",
      price: 25000,
      currency: "COP",
      duration_minutes: 15
    });
    expect(insertedInto("walk_ins")).toMatchObject({
      order_items: [
        { service_id: "svc-1" },
        { service_id: "svc-new", name: "Bandeja especial", quantity: 2, unit_price: 25000, currency: "COP", custom: true, added_to_menu: true }
      ]
    });
    expect(order).toMatchObject({ total: 68000, currency: "COP" });
  });

  it("reuses the menu product when the written-in name already exists, with the business price", async () => {
    useDb({
      organizations: ok(restaurant),
      services: ok([{ ...burger, name: "Hamburguesa", description: null }]),
      business_profiles: ok({ currency: "COP" }),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z" }), ok([{ id: "w-1" }])],
      integrations: ok([])
    });
    await createPublicOrder("antojitos", { items: [], customItems: [{ name: "  hamburguesa ", quantity: 1, unitPrice: 1 }], name: "Ana" });
    expect(insertedInto("services")).toBeUndefined();
    const stored = (insertedInto("walk_ins") as { order_items: Record<string, unknown>[] }).order_items[0];
    expect(stored).toMatchObject({ service_id: "svc-1", name: "Hamburguesa", unit_price: 18000 });
    expect(stored.custom).toBeUndefined();
  });

  it("accepts an order made only of things written by the customer", async () => {
    useDb({
      organizations: ok(restaurant),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z" }), ok([{ id: "w-1" }])],
      integrations: ok([])
    });
    await createPublicOrder("antojitos", { items: [], customItems: [{ name: "Jugo de mora en agua", quantity: 1 }], name: "Ana" });
    expect(insertedInto("walk_ins")).toMatchObject({
      service_id: null,
      order_items: [{ service_id: null, name: "Jugo de mora en agua", quantity: 1, custom: true }]
    });
  });

  it("rejects an empty order", async () => {
    useDb({ organizations: ok(restaurant) });
    await expect(createPublicOrder("antojitos", { items: [], customItems: [{ name: "   ", quantity: 1 }], name: "Ana" })).rejects.toMatchObject({
      statusCode: 400
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

  it("rejects a product that is not on today's menu", async () => {
    // Sábado 10 de octubre de 2026 en Bogotá; la sopa solo se ofrece lunes y jueves.
    useDb({ organizations: ok(restaurant), services: ok([burger, { ...lemonade, name: "Sopa", available_days: [1, 4] }]) });
    await expect(
      createPublicOrder(
        "antojitos",
        {
          items: [
            { serviceId: "svc-1", quantity: 1 },
            { serviceId: "svc-2", quantity: 1 }
          ],
          name: "Ana"
        },
        new Date("2026-10-10T17:00:00Z")
      )
    ).rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining("no está disponible hoy") });
  });

  it("rejects a product sold out today, naming it", async () => {
    useDb({ organizations: ok(restaurant), services: ok([burger, { ...lemonade, sold_out_on: "2026-10-10" }]) });
    await expect(
      createPublicOrder(
        "antojitos",
        {
          items: [
            { serviceId: "svc-1", quantity: 1 },
            { serviceId: "svc-2", quantity: 1 }
          ],
          name: "Ana"
        },
        new Date("2026-10-10T17:00:00Z")
      )
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining(`Se agotó por hoy: ${lemonade.name}`) });
  });

  it("rejects businesses whose public page is for bookings", async () => {
    useDb({ organizations: ok({ ...restaurant, business_type: "spa" }) });
    await expect(createPublicOrder("spa", { items: [{ serviceId: "svc-1", quantity: 1 }], name: "Ana" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("order helpers", () => {
  it("keeps one name per portion, trimmed and without blanks", () => {
    expect(cleanForNames(undefined, 2)).toEqual([]);
    expect(cleanForNames(["  Ana ", " ", "Luis", "Pedro"], 2)).toEqual(["Ana", "Luis"]);
    expect(cleanForNames(["x".repeat(60)], 1)[0]).toHaveLength(40);
  });

  it("joins the names of repeated lines of the same product", () => {
    expect(
      mergeOrderItems([
        { serviceId: "a", quantity: 1, forNames: ["Ana"] },
        { serviceId: "a", quantity: 1, forNames: ["Luis"] }
      ])
    ).toEqual([{ serviceId: "a", quantity: 2, forNames: ["Ana", "Luis"] }]);
  });

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

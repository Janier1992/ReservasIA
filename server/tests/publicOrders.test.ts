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

const { buildOrderReadyText, createPublicOrder, extractOrderCode, generateOrderCode, handleOrderCodeMessage } = await import(
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

describe("createPublicOrder", () => {
  it("queues the order and offers only the connected channels", async () => {
    useDb({
      organizations: ok(restaurant),
      services: ok({ id: "svc-1", duration_minutes: 15 }),
      walk_ins: [ok({ id: "w-1", arrived_at: "2026-09-27T12:00:00Z", services: { name: "Hamburguesa" } }), ok([{ id: "w-0" }, { id: "w-1" }])],
      integrations: ok([{ provider: "telegram", metadata: { bot_username: "AntojitosBot" } }])
    });
    const order = await createPublicOrder("antojitos", { serviceId: "svc-1", name: "Ana Ruiz" });
    expect(order).toMatchObject({ position: 2, serviceName: "Hamburguesa", whatsappUrl: null });
    expect(order.telegramUrl).toBe(`https://t.me/AntojitosBot?start=${order.code}`);
  });

  it("rejects businesses whose public page is for bookings", async () => {
    useDb({ organizations: ok({ ...restaurant, business_type: "spa" }) });
    await expect(createPublicOrder("spa", { serviceId: "svc-1", name: "Ana" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("handleOrderCodeMessage", () => {
  const msg = { organizationId: "org-1", code: "ABCDE23456", channel: "telegram" as const, identity: "telegram:77", customerId: "c-1", conversationId: "conv-1" };

  it("links the chat to an active order and confirms", async () => {
    useDb({
      walk_ins: [ok({ id: "w-1", customer_id: null, customer_name: "Ana Ruiz", status: "waiting", services: { name: "Hamburguesa" } }), ok(null)],
      messages: ok(null)
    });
    expect(await handleOrderCodeMessage(msg)).toBe(
      "¡Hola Ana! Recibimos tu pedido de Hamburguesa. Te escribimos por acá apenas esté listo para reclamar."
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
});

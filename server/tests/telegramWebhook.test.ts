import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

process.env.TELEGRAM_MODE = "webhook";
process.env.TELEGRAM_WEBHOOK_BASE_URL = "https://api.reservas.test/";
process.env.TELEGRAM_WEBHOOK_SECRET = "secreto-de-prueba-123456";

const processUpdateMock = vi.fn(async () => {});
const getWebhookInfoMock = vi.fn();
const setWebhookMock = vi.fn(async () => {});
const listBotsMock = vi.fn();
const loadTokenMock = vi.fn();

vi.mock("../src/services/telegram/telegramUpdateHandler.js", () => ({
  processUpdate: (...args: unknown[]) => processUpdateMock(...(args as []))
}));

vi.mock("../src/services/telegram/telegramService.js", () => ({
  getTelegramWebhookInfo: (...args: unknown[]) => getWebhookInfoMock(...args),
  setTelegramWebhook: (...args: unknown[]) => setWebhookMock(...(args as [])),
  listConnectedTelegramBots: (...args: unknown[]) => listBotsMock(...args),
  loadConnectedTelegramBotToken: (...args: unknown[]) => loadTokenMock(...args),
  deleteTelegramWebhook: vi.fn(),
  getTelegramUpdates: vi.fn(),
  TELEGRAM_POLL_CONFLICT: "TELEGRAM_POLL_CONFLICT"
}));

let insforgeMockInstance = createInsforgeMock({}, { acquire_scheduler_lease: { data: true, error: null } });
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { createApp } = await import("../src/app.js");
const webhook = await import("../src/services/telegram/telegramWebhookManager.js");

const ORG = "11111111-aaaa-0000-0000-000000000001";
const OTHER_ORG = "22222222-bbbb-0000-0000-000000000002";
const update = { update_id: 10, message: { message_id: 5, date: 0, chat: { id: 99, type: "private" }, text: "hola" } };

describe("Telegram por webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = createInsforgeMock({}, { acquire_scheduler_lease: { data: true, error: null } });
    loadTokenMock.mockResolvedValue("bot-token-a");
  });

  it("activa el modo webhook solo con URL y secreto configurados", () => {
    expect(webhook.isTelegramWebhookMode()).toBe(true);
    expect(webhook.telegramWebhookUrlFor(ORG)).toBe(`https://api.reservas.test/api/webhooks/telegram/${ORG}`);
  });

  it("cada negocio tiene su propio secreto", () => {
    const a = webhook.telegramWebhookSecretFor(ORG);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(webhook.isValidTelegramWebhookSecret(ORG, a)).toBe(true);
    expect(webhook.isValidTelegramWebhookSecret(OTHER_ORG, a)).toBe(false);
    expect(webhook.isValidTelegramWebhookSecret(ORG, undefined)).toBe(false);
  });

  it("rechaza un mensaje sin el secreto del negocio", async () => {
    const res = await request(createApp())
      .post(`/api/webhooks/telegram/${ORG}`)
      .set("X-Telegram-Bot-Api-Secret-Token", webhook.telegramWebhookSecretFor(OTHER_ORG))
      .send(update);
    expect(res.status).toBe(403);
    expect(processUpdateMock).not.toHaveBeenCalled();
  });

  it("responde 200 y procesa el mensaje con el bot del negocio", async () => {
    const res = await request(createApp())
      .post(`/api/webhooks/telegram/${ORG}`)
      .set("X-Telegram-Bot-Api-Secret-Token", webhook.telegramWebhookSecretFor(ORG))
      .send(update);
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(processUpdateMock).toHaveBeenCalledWith(ORG, "bot-token-a", update));
  });

  it("ignora (con 200) lo que no es un mensaje, para que Telegram no reintente", async () => {
    const res = await request(createApp())
      .post(`/api/webhooks/telegram/${ORG}`)
      .set("X-Telegram-Bot-Api-Secret-Token", webhook.telegramWebhookSecretFor(ORG))
      .send({ update_id: 11, edited_message: {} });
    expect(res.status).toBe(200);
    expect(processUpdateMock).not.toHaveBeenCalled();
  });

  it("registra el webhook de los bots que todavía no lo tienen, una sola vez", async () => {
    listBotsMock.mockResolvedValue([
      { organizationId: ORG, botToken: "bot-token-a" },
      { organizationId: OTHER_ORG, botToken: "bot-token-b" }
    ]);
    getWebhookInfoMock.mockImplementation(async (token: string) => ({
      url: token === "bot-token-b" ? webhook.telegramWebhookUrlFor(OTHER_ORG) : ""
    }));
    expect(await webhook.syncTelegramWebhooks()).toEqual({ registered: 1, failed: 0 });
    expect(setWebhookMock).toHaveBeenCalledWith("bot-token-a", webhook.telegramWebhookUrlFor(ORG), webhook.telegramWebhookSecretFor(ORG));

    await webhook.syncTelegramWebhooks();
    expect(getWebhookInfoMock).toHaveBeenCalledTimes(2); // la segunda vuelta no vuelve a consultar
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const getTelegramUpdates = vi.fn();

vi.mock("../src/services/telegram/telegramService.js", () => ({
  TELEGRAM_POLL_CONFLICT: "TELEGRAM_POLL_CONFLICT",
  deleteTelegramWebhook: vi.fn().mockResolvedValue(undefined),
  listConnectedTelegramBots: vi.fn().mockResolvedValue([{ organizationId: "org-1", botToken: "tok" }]),
  getTelegramUpdates: (...args: unknown[]) => getTelegramUpdates(...args)
}));
vi.mock("../src/services/telegram/telegramUpdateHandler.js", () => ({ processUpdate: vi.fn() }));

const { startTelegramPollingManager, stopTelegramPollingManager, getTelegramPollerHealth } = await import(
  "../src/services/telegram/telegramPollingManager.js"
);

describe("telegramPollingManager loop", () => {
  afterEach(() => {
    stopTelegramPollingManager();
    vi.useRealTimers();
  });

  it("sigue consultando después de un timeout de getUpdates (corte de red) en vez de detener el bot", async () => {
    vi.useFakeTimers();
    let calls = 0;
    getTelegramUpdates.mockImplementation(async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
      // Después del corte, Telegram vuelve a responder (sin mensajes nuevos).
      await new Promise((r) => setTimeout(r, 1000));
      return [];
    });
    startTelegramPollingManager();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(getTelegramPollerHealth().activeOrgCount).toBe(1);
  });
});

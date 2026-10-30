import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ciclo completo de un bot de Telegram en el server, con la base como quedó
 * en producción el 30/10: conexiones nuevas guardadas sin cifrar (lo que
 * hace telegram-connect) junto a una vieja que ya no se puede descifrar.
 *  - Un negocio que conecta su bot queda atendido en el siguiente refresco
 *    (cada 30 s), y los mensajes que llegan van al agente con su token.
 *  - Reconectar con otro token cambia el bot que se lee.
 *  - Desconectar lo deja de leer.
 *  - La conexión ilegible no frena a los demás.
 */

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("../src/lib/insforge.js", () => ({
  insforgeAdmin: {
    database: {
      from: () => {
        const filters: Record<string, unknown> = {};
        const query: Record<string, unknown> = {};
        query.select = () => query;
        query.eq = (col: string, value: unknown) => {
          filters[col] = value;
          return query;
        };
        query.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: db.rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v)), error: null });
        return query;
      }
    }
  }
}));
vi.mock("../src/lib/alerts.js", () => ({ reportFailure: vi.fn(), reportCriticalFailure: vi.fn() }));

const telegram = vi.hoisted(() => ({
  /** Token → mensajes pendientes que devuelve el próximo getUpdates. */
  pending: new Map<string, unknown[]>(),
  polledTokens: new Set<string>()
}));
vi.mock("../src/services/telegram/telegramService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/telegram/telegramService.js")>();
  return {
    ...actual,
    deleteTelegramWebhook: vi.fn(async () => {}),
    // Como el long-poll real: devuelve lo pendiente o espera hasta que se corte.
    getTelegramUpdates: vi.fn(
      (botToken: string, _offset: number, _timeout: number, signal: AbortSignal) =>
        new Promise((resolve) => {
          telegram.polledTokens.add(botToken);
          const updates = telegram.pending.get(botToken) ?? [];
          if (updates.length > 0) {
            telegram.pending.delete(botToken);
            return resolve(updates);
          }
          signal.addEventListener("abort", () => resolve([]), { once: true });
        })
    )
  };
});

const processUpdate = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../src/services/telegram/telegramUpdateHandler.js", () => ({ processUpdate }));

const { startTelegramPollingManager, stopTelegramPollingManager, getTelegramPollerHealth } = await import(
  "../src/services/telegram/telegramPollingManager.js"
);

const connected = (org: string, credentials: Record<string, unknown>) => ({
  organization_id: org,
  provider: "telegram",
  status: "connected",
  credentials
});
const UNREADABLE = { _enc: "v1", iv: "AAAAAAAAAAAAAAAA", ct: "cifrado-con-una-clave-vieja" };

/** Deja correr el refresco que toca y las promesas que arranca. */
async function nextRefresh() {
  await vi.advanceTimersByTimeAsync(30_000);
}

beforeEach(() => {
  vi.useFakeTimers();
  db.rows = [connected("org-vieja", UNREADABLE)];
  telegram.pending.clear();
  telegram.polledTokens.clear();
  processUpdate.mockClear();
});

afterEach(() => {
  stopTelegramPollingManager();
  vi.useRealTimers();
});

describe("ciclo de un bot de Telegram en el server", () => {
  it("un negocio que conecta su bot queda atendido y sus mensajes llegan al agente", async () => {
    startTelegramPollingManager();
    await vi.advanceTimersByTimeAsync(0);
    expect(getTelegramPollerHealth().activeOrgCount).toBe(0);

    // telegram-connect guarda el token sin cifrar.
    db.rows.push(connected("org-nueva", { bot_token: "111:nuevo" }));
    const message = { update_id: 1, message: { chat: { id: 42 }, text: "hola" } };
    telegram.pending.set("111:nuevo", [message]);
    await nextRefresh();

    expect(getTelegramPollerHealth().activeOrgCount).toBe(1);
    expect(telegram.polledTokens).toEqual(new Set(["111:nuevo"]));
    expect(processUpdate).toHaveBeenCalledWith("org-nueva", "111:nuevo", message);
  });

  it("reconectar con otro token cambia el bot que se lee, y desconectar lo deja de leer", async () => {
    db.rows.push(connected("org-1", { bot_token: "111:viejo" }));
    startTelegramPollingManager();
    await vi.advanceTimersByTimeAsync(0);
    expect(telegram.polledTokens).toEqual(new Set(["111:viejo"]));

    db.rows[1] = connected("org-1", { bot_token: "222:nuevo" });
    telegram.polledTokens.clear();
    await nextRefresh();
    expect(telegram.polledTokens).toEqual(new Set(["222:nuevo"]));
    expect(getTelegramPollerHealth().activeOrgCount).toBe(1);

    db.rows[1] = { ...db.rows[1], status: "disconnected" };
    await nextRefresh();
    expect(getTelegramPollerHealth().activeOrgCount).toBe(0);
  });

  it("varios negocios a la vez, con una conexión vieja ilegible en el medio", async () => {
    db.rows.push(connected("org-a", { bot_token: "1:a" }), connected("org-b", { bot_token: "2:b" }));
    startTelegramPollingManager();
    await vi.advanceTimersByTimeAsync(0);
    expect(getTelegramPollerHealth().activeOrgCount).toBe(2);
    expect(telegram.polledTokens).toEqual(new Set(["1:a", "2:b"]));
  });
});

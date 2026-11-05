import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { encryptCredentials, tryDecryptCredentials } from "../src/lib/credentialsCrypto.js";

/**
 * Credenciales cifradas con otra clave (pasa al cambiar
 * INTEGRATIONS_ENCRYPTION_KEY, o si Railway e InsForge tienen claves
 * distintas): una sola fila ilegible no puede dejar sin canal a los demás
 * negocios, y el panel tiene que pedir reconectar esa integración.
 */

const alerts = vi.hoisted(() => ({ critical: vi.fn() }));
vi.mock("../src/lib/alerts.js", () => ({ reportCriticalFailure: alerts.critical, reportFailure: vi.fn() }));

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  updates: [] as { id: unknown; patch: Record<string, unknown> }[]
}));
vi.mock("../src/lib/insforge.js", () => ({
  insforgeAdmin: {
    database: {
      from: () => {
        let patch: Record<string, unknown> | null = null;
        const query: Record<string, unknown> = {};
        for (const m of ["select", "in", "order", "limit"]) query[m] = () => query;
        const filters: Record<string, unknown> = {};
        query.eq = (col: string, value: unknown) => {
          filters[col] = value;
          if (patch && col === "id") db.updates.push({ id: value, patch });
          return query;
        };
        query.update = (p: Record<string, unknown>) => {
          patch = p;
          return query;
        };
        const matching = () => db.rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        query.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null });
        query.then = (resolve: (v: unknown) => unknown) => resolve({ data: matching(), error: null });
        return query;
      }
    }
  }
}));

const { checkIntegrationCredentials, readIntegrationCredentials, CREDENTIALS_UNREADABLE } = await import(
  "../src/services/integrations/credentialsCheck.js"
);
const { listConnectedTelegramBots } = await import("../src/services/telegram/telegramService.js");

/** Cifra con una clave vieja, como las filas guardadas antes de cambiarla. */
function withOldKey(credentials: Record<string, unknown>) {
  const current = env.INTEGRATIONS_ENCRYPTION_KEY;
  env.INTEGRATIONS_ENCRYPTION_KEY = "clave-vieja-que-ya-no-esta";
  try {
    return encryptCredentials(credentials);
  } finally {
    env.INTEGRATIONS_ENCRYPTION_KEY = current;
  }
}

const row = (id: string, org: string, credentials: Record<string, unknown>, status = "connected", metadata: Record<string, unknown> = {}) => ({
  id,
  organization_id: org,
  provider: "telegram",
  status,
  credentials,
  metadata
});

beforeEach(() => {
  db.rows = [];
  db.updates = [];
  alerts.critical.mockReset();
});

describe("credenciales ilegibles de integraciones", () => {
  it("una fila cifrada con otra clave no deja sin Telegram a los demás negocios", async () => {
    db.rows = [row("i1", "org-vieja", withOldKey({ bot_token: "viejo" })), row("i2", "org-nueva", encryptCredentials({ bot_token: "nuevo" }))];
    expect(await listConnectedTelegramBots()).toEqual([{ organizationId: "org-nueva", botToken: "nuevo" }]);
    expect(alerts.critical).toHaveBeenCalledWith("integration_credentials_unreadable", expect.any(Error));
  });

  it("devuelve null en vez de fallar, y lo avisa", () => {
    expect(readIntegrationCredentials("ycloud", "org-1", withOldKey({ api_key: "k" }))).toBeNull();
    expect(alerts.critical).toHaveBeenCalledOnce();
    expect(readIntegrationCredentials("ycloud", "org-1", encryptCredentials({ api_key: "k" }))).toEqual({ api_key: "k" });
  });

  it("la revisión periódica pasa a 'Reconectar' las ilegibles y deja las demás como están", async () => {
    db.rows = [row("i1", "org-vieja", withOldKey({ bot_token: "viejo" }), "connected", { bot_username: "viejo_bot" }), row("i2", "org-nueva", encryptCredentials({ bot_token: "nuevo" }))];
    expect(await checkIntegrationCredentials()).toEqual({ readable: 1, unreadable: 1, marked: 1, restored: 0 });
    expect(db.updates).toEqual([{ id: "i1", patch: { status: "error", metadata: { bot_username: "viejo_bot", last_error: CREDENTIALS_UNREADABLE } } }]);
  });

  it("si la clave se corrige, las marcadas vuelven solas a 'conectada' sin que el negocio reconecte", async () => {
    db.rows = [row("i1", "org-1", encryptCredentials({ bot_token: "t" }), "error", { bot_username: "b", last_error: CREDENTIALS_UNREADABLE })];
    expect(await checkIntegrationCredentials()).toEqual({ readable: 1, unreadable: 0, marked: 0, restored: 1 });
    expect(db.updates).toEqual([{ id: "i1", patch: { status: "connected", metadata: { bot_username: "b" } } }]);
  });

  it("no toca una integración en error por otro motivo (p. ej. Google vencido)", async () => {
    db.rows = [row("i1", "org-1", encryptCredentials({ refresh_token: "r" }), "error", { last_error: "token_expired" })];
    await checkIntegrationCredentials();
    expect(db.updates).toEqual([]);
  });

  it("ignora espacios o saltos de línea pegados de más en la clave", () => {
    const encrypted = encryptCredentials({ bot_token: "t" });
    const current = env.INTEGRATIONS_ENCRYPTION_KEY;
    env.INTEGRATIONS_ENCRYPTION_KEY = `  ${current}\n`;
    try {
      expect(tryDecryptCredentials(encrypted)).toEqual({ bot_token: "t" });
    } finally {
      env.INTEGRATIONS_ENCRYPTION_KEY = current;
    }
  });
});

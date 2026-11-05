import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, resetFakeDb } from "./stubs/fakeInsforge.js";

/**
 * confirm-subscription-payment: cuántos meses suma al confirmar. El plan
 * mensual suma 1 mes (30 días) y el anual 12 (360 días); cualquier otro
 * valor se rechaza antes de tocar el pago.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const DAY_MS = 24 * 60 * 60 * 1000;

const ENV: Record<string, string> = { INSFORGE_BASE_URL: "https://insforge.test", API_KEY: "admin-key" };

beforeEach(() => {
  resetFakeDb(
    {
      organizations: [{ id: ORG, name: "Negocio A", status: "suspended", subscription_expires_at: null }],
      support_staff: [{ user_id: "user-support", active: true }],
      subscription_payments: [{ id: "pay-1", organization_id: ORG, status: "pending", receipt_storage_path: "r.jpg" }],
      business_profiles: []
    },
    { "token-support": "user-support" }
  );
  vi.stubGlobal("Deno", { env: { get: (key: string) => ENV[key] } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function confirm(body: Record<string, unknown>): Promise<Response> {
  const mod = (await import("../../../functions/confirm-subscription-payment.ts")) as { default: (req: Request) => Promise<Response> };
  return mod.default(
    new Request("https://insforge.test/functions/confirm-subscription-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-support" },
      body: JSON.stringify({ payment_id: "pay-1", action: "confirm", ...body })
    })
  );
}

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

describe("confirm-subscription-payment", () => {
  it("sin meses indicados suma un mes, como antes", async () => {
    const res = await confirm({});
    expect(res.status).toBe(200);
    const { subscription_expires_at } = (await res.json()) as { subscription_expires_at: string };
    expect(daysUntil(subscription_expires_at)).toBe(30);
  });

  it("el plan anual suma 12 meses", async () => {
    const res = await confirm({ months: 12 });
    expect(res.status).toBe(200);
    const { subscription_expires_at } = (await res.json()) as { subscription_expires_at: string };
    expect(daysUntil(subscription_expires_at)).toBe(360);
    const orgUpdate = fakeDb.writes.find((w) => w.table === "organizations" && w.op === "update");
    expect(orgUpdate?.payload).toMatchObject({ status: "active", subscription_expires_at });
  });

  it("rechaza otra cantidad de meses sin tocar el pago", async () => {
    const res = await confirm({ months: 7 });
    expect(res.status).toBe(400);
    expect(fakeDb.writes).toHaveLength(0);
  });
});

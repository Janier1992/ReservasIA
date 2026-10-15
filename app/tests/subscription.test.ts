import { describe, expect, it } from "vitest";
import { daysLeftLabel, subscriptionState } from "@/lib/subscription";

describe("subscriptionState", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("en prueba mientras el vencimiento no pase del fin de la prueba", () => {
    const state = subscriptionState({ trial_ends_at: "2026-10-27T12:00:00Z", subscription_expires_at: "2026-10-27T12:00:00Z" }, now);
    expect(state).toMatchObject({ kind: "trial", daysLeft: 7 });
  });

  it("con un pago confirmado (vence después de la prueba) deja de ser prueba", () => {
    expect(subscriptionState({ trial_ends_at: "2026-10-27T12:00:00Z", subscription_expires_at: "2026-11-26T12:00:00Z" }, now)).toEqual({ kind: "ok" });
  });

  it("avisa cuando una suscripción paga vence pronto", () => {
    expect(subscriptionState({ trial_ends_at: null, subscription_expires_at: "2026-10-23T12:00:00Z" }, now)).toMatchObject({ kind: "expiring", daysLeft: 3 });
  });

  it("sin fecha de vencimiento no avisa nada (negocios anteriores)", () => {
    expect(subscriptionState({ trial_ends_at: null, subscription_expires_at: null }, now)).toEqual({ kind: "ok" });
  });

  it("redacta los días que quedan", () => {
    expect(daysLeftLabel(0)).toBe("vence hoy");
    expect(daysLeftLabel(1)).toBe("te queda 1 día");
    expect(daysLeftLabel(9)).toBe("te quedan 9 días");
  });
});

import { describe, expect, it } from "vitest";
import { computeExpiry, customerPlanFromCatalog, planBalanceText, planProgress } from "@/lib/plans";
import { parseAmount, totalByCurrency, totalsByMethod, zonedDayRange } from "@/lib/payments";
import type { PackagePlan } from "@/types/domain";

const plan: PackagePlan = {
  id: "p1",
  organization_id: "org",
  name: "5 sesiones",
  kind: "sessions",
  sessions_total: 5,
  validity_days: 30,
  price: 150000,
  currency: "COP",
  service_ids: ["s1"],
  reward_text: null,
  is_active: true
};

describe("plans", () => {
  it("computes the expiry counting the start day", () => {
    expect(computeExpiry("2026-09-27", 30)).toBe("2026-10-26");
    expect(computeExpiry("2026-09-27", null)).toBeNull();
  });

  it("copies the catalog plan into the customer's plan", () => {
    expect(customerPlanFromCatalog(plan, "org", "c1", "2026-09-27")).toEqual({
      organization_id: "org",
      customer_id: "c1",
      plan_id: "p1",
      name: "5 sesiones",
      kind: "sessions",
      sessions_total: 5,
      service_ids: ["s1"],
      reward_text: null,
      starts_on: "2026-09-27",
      expires_on: "2026-10-26"
    });
    expect(customerPlanFromCatalog({ ...plan, kind: "membership" }, "org", "c1", "2026-09-27").sessions_total).toBeNull();
  });

  it("describes the balance for each kind", () => {
    expect(planBalanceText({ kind: "sessions", sessions_total: 5, sessions_used: 2, expires_on: null })).toBe("Quedan 3 de 5");
    expect(planBalanceText({ kind: "stamps", sessions_total: 10, sessions_used: 4, expires_on: null })).toBe("4 de 10 sellos");
    expect(planBalanceText({ kind: "membership", sessions_total: null, sessions_used: 0, expires_on: "2026-10-31" })).toBe("Ilimitado hasta 2026-10-31");
    expect(planProgress({ kind: "stamps", sessions_total: 10, sessions_used: 4 })).toBe(0.4);
    expect(planProgress({ kind: "membership", sessions_total: null, sessions_used: 3 })).toBeNull();
  });
});

describe("payments", () => {
  it("parses Colombian-style amounts", () => {
    expect(parseAmount("35.000")).toBe(35000);
    expect(parseAmount("1.250.000")).toBe(1250000);
    expect(parseAmount("35000,50")).toBe(35000.5);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });

  it("adds up totals by method and currency", () => {
    const payments = [
      { method: "cash" as const, amount: 20000, currency: "COP" },
      { method: "cash" as const, amount: 15000, currency: "COP" },
      { method: "nequi" as const, amount: 35000, currency: "COP" }
    ];
    expect(totalsByMethod(payments)).toEqual({ cash: { COP: 35000 }, nequi: { COP: 35000 } });
    expect(totalByCurrency(payments)).toEqual({ COP: 70000 });
  });
});

describe("zonedDayRange", () => {
  it("returns the business day boundaries in UTC", () => {
    expect(zonedDayRange("2026-09-27", "America/Bogota")).toEqual({ from: "2026-09-27T05:00:00.000Z", to: "2026-09-28T05:00:00.000Z" });
    expect(zonedDayRange("2026-12-31", "UTC")).toEqual({ from: "2026-12-31T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" });
  });

  it("handles daylight saving changes", () => {
    // Nueva York adelanta el reloj el 8 de marzo de 2026: ese día dura 23 horas.
    const { from, to } = zonedDayRange("2026-03-08", "America/New_York");
    expect((new Date(to).getTime() - new Date(from).getTime()) / 3_600_000).toBe(23);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeNoShowRate,
  computeOccupancyByHour,
  computeRevenueByCurrency,
  computeTopService,
  type ReportReservationRow
} from "@/lib/businessReport";

function row(overrides: Partial<ReportReservationRow>): ReportReservationRow {
  return {
    status: "completed",
    start_at: "2026-09-15T14:00:00.000Z",
    services: { name: "Corte", price: 30000, currency: "COP" },
    ...overrides
  };
}

describe("computeRevenueByCurrency", () => {
  it("sums the price of completed reservations, grouped by currency", () => {
    const rows = [
      row({ services: { name: "Corte", price: 30000, currency: "COP" } }),
      row({ services: { name: "Manicura", price: 40000, currency: "COP" } }),
      row({ services: { name: "Masaje", price: 50, currency: "USD" } })
    ];
    expect(computeRevenueByCurrency(rows)).toEqual({ COP: 70000, USD: 50 });
  });

  it("ignores reservations that are not completed, or have no price/service", () => {
    const rows = [
      row({ status: "pending" }),
      row({ status: "cancelled" }),
      row({ services: null }),
      row({ services: { name: "Cortesía", price: null, currency: "COP" } })
    ];
    expect(computeRevenueByCurrency(rows)).toEqual({});
  });
});

describe("computeTopService", () => {
  it("returns the completed service with the most reservations", () => {
    const rows = [
      row({ services: { name: "Corte", price: 30000, currency: "COP" } }),
      row({ services: { name: "Corte", price: 30000, currency: "COP" } }),
      row({ services: { name: "Manicura", price: 40000, currency: "COP" } })
    ];
    expect(computeTopService(rows)).toEqual({ name: "Corte", count: 2 });
  });

  it("returns null when there are no completed reservations", () => {
    expect(computeTopService([row({ status: "pending" })])).toBeNull();
  });
});

describe("computeNoShowRate", () => {
  it("computes the percentage of no-shows over completed+no_show", () => {
    const rows = [row({ status: "completed" }), row({ status: "completed" }), row({ status: "no_show" })];
    expect(computeNoShowRate(rows)).toBeCloseTo(33.33, 1);
  });

  it("returns 0 instead of NaN when there is no completed/no_show data", () => {
    expect(computeNoShowRate([row({ status: "pending" }), row({ status: "cancelled" })])).toBe(0);
  });
});

describe("computeOccupancyByHour", () => {
  // Las horas esperadas se derivan del mismo `Date` que usa la función (no se
  // hardcodean en UTC): `computeOccupancyByHour` agrupa por hora LOCAL del
  // proceso a propósito, igual que el resto de la app (ver `.toLocaleString()`
  // en las vistas de reservas) — hardcodear "14" u "9" haría el test frágil
  // según la zona horaria de quien lo corra.
  const busyIso = "2026-09-15T14:00:00.000Z";
  const busyIso2 = "2026-09-16T14:30:00.000Z";
  const quietIso = "2026-09-15T09:00:00.000Z";
  const busyHour = new Date(busyIso).getHours();
  const quietHour = new Date(quietIso).getHours();

  it("counts reservations per hour, excluding cancelled, sorted by busiest first", () => {
    const rows = [
      row({ start_at: busyIso }),
      row({ start_at: busyIso2 }),
      row({ start_at: quietIso }),
      row({ status: "cancelled", start_at: busyIso })
    ];
    const result = computeOccupancyByHour(rows);
    expect(result[0]).toMatchObject({ hour: busyHour, count: 2 });
    expect(result.find((r) => r.hour === quietHour)).toMatchObject({ hour: quietHour, count: 1 });
  });

  it("respects the limit parameter", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ start_at: `2026-09-15T${String(i).padStart(2, "0")}:00:00.000Z` }));
    expect(computeOccupancyByHour(rows, 3)).toHaveLength(3);
  });
});

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
  it("suma el precio de las reservas completadas, agrupado por moneda", () => {
    const rows = [
      row({ services: { name: "Corte", price: 30000, currency: "COP" } }),
      row({ services: { name: "Manicura", price: 40000, currency: "COP" } }),
      row({ services: { name: "Masaje", price: 50, currency: "USD" } })
    ];
    expect(computeRevenueByCurrency(rows)).toEqual({ COP: 70000, USD: 50 });
  });

  it("ignora las reservas no completadas o sin precio o servicio", () => {
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
  it("devuelve el servicio completado con más reservas", () => {
    const rows = [
      row({ services: { name: "Corte", price: 30000, currency: "COP" } }),
      row({ services: { name: "Corte", price: 30000, currency: "COP" } }),
      row({ services: { name: "Manicura", price: 40000, currency: "COP" } })
    ];
    expect(computeTopService(rows)).toEqual({ name: "Corte", count: 2 });
  });

  it("devuelve null cuando no hay reservas completadas", () => {
    expect(computeTopService([row({ status: "pending" })])).toBeNull();
  });
});

describe("computeNoShowRate", () => {
  it("computes the percentage of no-shows over completed+no_show", () => {
    const rows = [row({ status: "completed" }), row({ status: "completed" }), row({ status: "no_show" })];
    expect(computeNoShowRate(rows)).toBeCloseTo(33.33, 1);
  });

  it("devuelve 0 en vez de NaN cuando no hay datos de completadas ni de no_show", () => {
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

  it("cuenta reservas por hora, sin las canceladas, de la hora más ocupada a la menos", () => {
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

  it("respeta el parámetro de límite", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ start_at: `2026-09-15T${String(i).padStart(2, "0")}:00:00.000Z` }));
    expect(computeOccupancyByHour(rows, 3)).toHaveLength(3);
  });
});

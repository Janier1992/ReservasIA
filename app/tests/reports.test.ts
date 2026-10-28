import { describe, expect, it } from "vitest";
import { breakdownBy, countByDay, reportToCsv, sourceLabel, summarize, type ReportRow } from "@/lib/reports";

let seq = 0;
function row(partial: Partial<ReportRow>): ReportRow {
  seq++;
  return {
    id: `r-${seq}`,
    status: "completed",
    start_at: "2026-09-20T15:00:00Z",
    source: "whatsapp",
    customer_name: "Ana",
    services: { name: "Lavado general", price: 30000, currency: "COP" },
    resources: { name: "Bahía 1" },
    ...partial
  };
}

describe("summarize", () => {
  it("cuenta por estado y solo suma ingresos de las reservas completadas", () => {
    const summary = summarize([
      row({}),
      row({ services: { name: "Polichado", price: 90000, currency: "COP" } }),
      row({ status: "cancelled" }),
      row({ status: "no_show" }),
      row({ status: "confirmed" })
    ]);
    expect(summary).toMatchObject({ total: 5, completed: 2, cancelled: 1, noShow: 1, upcoming: 1 });
    expect(summary.revenueByCurrency).toEqual({ COP: 120000 });
    expect(summary.averageTicketByCurrency).toEqual({ COP: 60000 });
  });

  it("ignora los servicios sin precio para los ingresos y el ticket promedio", () => {
    const summary = summarize([row({ services: { name: "Cortesía", price: null, currency: "COP" } })]);
    expect(summary.completed).toBe(1);
    expect(summary.revenueByCurrency).toEqual({});
  });
});

describe("breakdownBy", () => {
  it("agrupa las reservas no canceladas, ordenadas por cantidad", () => {
    const result = breakdownBy(
      [row({}), row({}), row({ services: { name: "Polichado", price: 90000, currency: "COP" } }), row({ status: "cancelled" })],
      (r) => r.services?.name ?? null
    );
    expect(result.map((b) => [b.label, b.count])).toEqual([
      ["Lavado general", 2],
      ["Polichado", 1]
    ]);
    expect(result[0].revenueByCurrency).toEqual({ COP: 60000 });
  });

  it("labels missing values as 'Sin asignar'", () => {
    expect(breakdownBy([row({ resources: null })], (r) => r.resources?.name ?? null)[0].label).toBe("Sin asignar");
  });
});

describe("countByDay", () => {
  it("agrupa por día local del negocio y completa los días vacíos", () => {
    const days = countByDay(
      [
        // 23:30 del 19 en Bogotá (UTC-5) = 04:30 UTC del 20: cuenta para el 19.
        row({ start_at: "2026-09-20T04:30:00Z" }),
        row({ start_at: "2026-09-21T15:00:00Z" }),
        row({ start_at: "2026-09-21T16:00:00Z", status: "cancelled" })
      ],
      new Date("2026-09-19T12:00:00Z"),
      new Date("2026-09-21T12:00:00Z"),
      "America/Bogota"
    );
    expect(days).toEqual([
      { date: "2026-09-19", count: 1 },
      { date: "2026-09-20", count: 0 },
      { date: "2026-09-21", count: 1 }
    ]);
  });
});

describe("reportToCsv", () => {
  it("escribe una línea por reserva en hora local, con encabezado", () => {
    const csv = reportToCsv([row({ customer_name: "Pérez, Ana" })], "America/Bogota", (s) => (s === "completed" ? "Completada" : s));
    const [header, line] = csv.split("\r\n");
    expect(header).toBe("Fecha,Hora,Cliente,Servicio,Recurso,Canal,Estado,Precio,Moneda");
    expect(line).toBe('2026-09-20,10:00,"Pérez, Ana",Lavado general,Bahía 1,Agente IA (chat),Completada,30000,COP');
  });

  it("neutraliza los valores que una hoja de cálculo ejecutaría como fórmula", () => {
    const csv = reportToCsv([row({ customer_name: "=HYPERLINK(\"x\")" })], "UTC", (s) => s);
    expect(csv.split("\r\n")[1]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe("sourceLabel", () => {
  it("nombra los canales en español y deja los desconocidos tal cual", () => {
    expect(sourceLabel("walk_in")).toBe("Atención en sitio");
    expect(sourceLabel("instagram")).toBe("instagram");
  });
});

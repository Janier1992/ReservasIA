import { formatInTimeZone } from "date-fns-tz";
import type { ReservationStatus } from "@/types/domain";

export interface ReportRow {
  id: string;
  status: ReservationStatus;
  start_at: string;
  source: string;
  customer_name: string | null;
  services: { name: string; price: number | null; currency: string } | null;
  resources: { name: string } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  // El agente guarda "whatsapp" como origen para todos los chats (también
  // Telegram), así que se muestra como el canal del agente.
  whatsapp: "Agente IA (chat)",
  dashboard: "Panel del negocio",
  walk_in: "Atención en sitio"
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export interface ReportSummary {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  upcoming: number;
  revenueByCurrency: Record<string, number>;
  averageTicketByCurrency: Record<string, number>;
}

export function summarize(rows: ReportRow[]): ReportSummary {
  const summary: ReportSummary = {
    total: rows.length,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    upcoming: 0,
    revenueByCurrency: {},
    averageTicketByCurrency: {}
  };
  const pricedCount: Record<string, number> = {};

  for (const row of rows) {
    if (row.status === "completed") summary.completed++;
    else if (row.status === "cancelled") summary.cancelled++;
    else if (row.status === "no_show") summary.noShow++;
    else summary.upcoming++;

    if (row.status === "completed" && row.services && row.services.price !== null) {
      const { currency, price } = row.services;
      summary.revenueByCurrency[currency] = (summary.revenueByCurrency[currency] ?? 0) + price;
      pricedCount[currency] = (pricedCount[currency] ?? 0) + 1;
    }
  }

  for (const [currency, total] of Object.entries(summary.revenueByCurrency)) {
    summary.averageTicketByCurrency[currency] = total / pricedCount[currency];
  }
  return summary;
}

export interface Breakdown {
  label: string;
  count: number;
  revenueByCurrency: Record<string, number>;
}

/**
 * Agrupa reservas por una etiqueta (servicio, recurso, canal). Cuenta las
 * que ocuparon el horario (todo menos canceladas) y suma ingresos solo de
 * completadas. Ordenado de mayor a menor.
 */
export function breakdownBy(rows: ReportRow[], labelOf: (row: ReportRow) => string | null): Breakdown[] {
  const groups = new Map<string, Breakdown>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const label = labelOf(row) ?? "Sin asignar";
    const group = groups.get(label) ?? { label, count: 0, revenueByCurrency: {} };
    group.count++;
    if (row.status === "completed" && row.services && row.services.price !== null) {
      const { currency, price } = row.services;
      group.revenueByCurrency[currency] = (group.revenueByCurrency[currency] ?? 0) + price;
    }
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface DayCount {
  date: string; // YYYY-MM-DD en la zona horaria del negocio
  count: number;
}

/** Reservas por día (sin canceladas) en la zona del negocio, con los días sin movimiento en 0. */
export function countByDay(rows: ReportRow[], from: Date, to: Date, timezone: string): DayCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const day = formatInTimeZone(new Date(row.start_at), timezone, "yyyy-MM-dd");
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const days: DayCount[] = [];
  const seen = new Set<string>();
  for (let t = from.getTime(); t <= to.getTime(); t += 60 * 60 * 1000) {
    const day = formatInTimeZone(new Date(t), timezone, "yyyy-MM-dd");
    if (seen.has(day)) continue;
    seen.add(day);
    days.push({ date: day, count: counts.get(day) ?? 0 });
  }
  return days;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Comillas si hay separador, comillas o saltos; y un apóstrofo delante de
  // =,+,-,@ para que Excel no lo interprete como fórmula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function reportToCsv(rows: ReportRow[], timezone: string, statusLabel: (status: string) => string): string {
  const header = ["Fecha", "Hora", "Cliente", "Servicio", "Recurso", "Canal", "Estado", "Precio", "Moneda"];
  const lines = rows.map((row) => {
    const start = new Date(row.start_at);
    return [
      formatInTimeZone(start, timezone, "yyyy-MM-dd"),
      formatInTimeZone(start, timezone, "HH:mm"),
      row.customer_name,
      row.services?.name,
      row.resources?.name,
      sourceLabel(row.source),
      statusLabel(row.status),
      row.services?.price ?? "",
      row.services?.currency
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...lines].join("\r\n");
}

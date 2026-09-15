import type { ReservationStatus } from "@/types/domain";

export interface ReportReservationRow {
  status: ReservationStatus;
  start_at: string;
  services: { name: string; price: number | null; currency: string } | null;
}

/** Ingresos (suma de precio de servicio) de reservas completadas, agrupados por moneda. */
export function computeRevenueByCurrency(rows: ReportReservationRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    if (row.status !== "completed") continue;
    const service = row.services;
    if (!service || service.price === null) continue;
    totals[service.currency] = (totals[service.currency] ?? 0) + service.price;
  }
  return totals;
}

export interface TopService {
  name: string;
  count: number;
}

/** Servicio con más reservas completadas en el período. `null` si no hay ninguna. */
export function computeTopService(rows: ReportReservationRow[]): TopService | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "completed" || !row.services) continue;
    counts.set(row.services.name, (counts.get(row.services.name) ?? 0) + 1);
  }
  let top: TopService | null = null;
  for (const [name, count] of counts) {
    if (!top || count > top.count) top = { name, count };
  }
  return top;
}

/** % de reservas que terminaron en no-show, sobre el total de reservas completadas o no-show (excluye pendientes/canceladas). */
export function computeNoShowRate(rows: ReportReservationRow[]): number {
  let completed = 0;
  let noShow = 0;
  for (const row of rows) {
    if (row.status === "completed") completed++;
    else if (row.status === "no_show") noShow++;
  }
  const denominator = completed + noShow;
  if (denominator === 0) return 0;
  return (noShow / denominator) * 100;
}

export interface HourOccupancy {
  hour: number;
  count: number;
}

/** Franjas horarias con más reservas (excluye canceladas, que nunca ocuparon el horario). Ordenado de mayor a menor. */
export function computeOccupancyByHour(rows: ReportReservationRow[], limit = 5): HourOccupancy[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const hour = new Date(row.start_at).getHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

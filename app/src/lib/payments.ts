import type { Payment, PaymentMethod } from "@/types/domain";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  nequi: "Nequi",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro"
};

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

/** Totales por medio de pago y moneda: { cash: { COP: 120000 } }. */
export function totalsByMethod(payments: Pick<Payment, "method" | "amount" | "currency">[]): Partial<Record<PaymentMethod, Record<string, number>>> {
  const totals: Partial<Record<PaymentMethod, Record<string, number>>> = {};
  for (const p of payments) {
    const byCurrency = (totals[p.method] ??= {});
    byCurrency[p.currency] = (byCurrency[p.currency] ?? 0) + Number(p.amount);
  }
  return totals;
}

export function totalByCurrency(payments: Pick<Payment, "amount" | "currency">[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of payments) totals[p.currency] = (totals[p.currency] ?? 0) + Number(p.amount);
  return totals;
}

/** Monto tipeado ("35.000", "35000,50") a número; null si no es un monto válido > 0. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "");
  if (!cleaned) return null;
  // Formato colombiano: punto de miles, coma decimal.
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Cantidad tipeada a entero entre 1 y 999; null si no es válida. */
export function parseQuantity(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : null;
}

export interface ProductSales {
  /** id del producto, o el concepto cuando la venta no tiene producto. */
  key: string;
  name: string;
  quantity: number;
  totals: Record<string, number>;
}

/** Productos vendidos: cantidades y totales por moneda, del más vendido al menos. */
export function salesByProduct(
  payments: Pick<Payment, "service_id" | "quantity" | "amount" | "currency" | "concept" | "services">[]
): ProductSales[] {
  const byKey = new Map<string, ProductSales>();
  for (const p of payments) {
    const name = p.services?.name ?? p.concept?.trim() ?? "";
    const key = p.service_id ?? `concept:${name.toLowerCase() || "sin-concepto"}`;
    const row = byKey.get(key) ?? { key, name: name || "Otros cobros", quantity: 0, totals: {} };
    row.quantity += p.quantity ?? 1;
    row.totals[p.currency] = (row.totals[p.currency] ?? 0) + Number(p.amount);
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

function offsetMinutes(instant: number, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - instant) / 60000);
}

function zonedMidnight(date: string, timezone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMinutes(guess, timezone) * 60000;
  // Segunda pasada por si el día cruza un cambio de horario.
  return guess - offsetMinutes(first, timezone) * 60000;
}

/** Inicio y fin (ISO, fin exclusivo) del día YYYY-MM-DD en la zona horaria del negocio. */
export function zonedDayRange(date: string, timezone: string): { from: string; to: string } {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { from: new Date(zonedMidnight(date, timezone)).toISOString(), to: new Date(zonedMidnight(next, timezone)).toISOString() };
}

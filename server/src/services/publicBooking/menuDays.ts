import { formatInTimeZone } from "date-fns-tz";

/**
 * Menú del día (restaurantes): services.available_days guarda los días en que
 * se ofrece cada producto, 0 = domingo ... 6 = sábado; null = todos los días.
 */

/** Día de la semana (0 = domingo) en la zona horaria del negocio. */
export function weekdayIn(timezone: string, now = new Date()): number {
  // "i" es el día ISO: 1 = lunes ... 7 = domingo.
  return Number(formatInTimeZone(now, timezone, "i")) % 7;
}

export function isOnMenu(availableDays: number[] | null | undefined, weekday: number): boolean {
  return !availableDays || availableDays.length === 0 || availableDays.includes(weekday);
}

/** Fecha local del negocio, "yyyy-MM-dd" (como la guarda services.sold_out_on). */
export function localDateIn(timezone: string, now = new Date()): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

/** Agotado del día: solo cuenta si se marcó hoy; al día siguiente vuelve solo. */
export function isSoldOut(soldOutOn: string | null | undefined, today: string): boolean {
  return !!soldOutOn && soldOutOn.slice(0, 10) === today;
}

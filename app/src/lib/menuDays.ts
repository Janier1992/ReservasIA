/**
 * Menú del día (restaurantes): services.available_days guarda los días en que
 * se ofrece cada producto, 0 = domingo ... 6 = sábado; null = todos los días.
 * Misma regla que server/src/services/publicBooking/menuDays.ts.
 */

/** Lunes primero, como se lee la semana en un menú. */
export const MENU_WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_SHORT = ["D", "L", "M", "X", "J", "V", "S"];
export const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const ISO_WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Día de la semana (0 = domingo) en la zona horaria del negocio. */
export function weekdayIn(timezone: string, now = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
  return ISO_WEEKDAY[short] ?? now.getDay();
}

export function isOnMenu(availableDays: number[] | null | undefined, weekday: number): boolean {
  return !availableDays || availableDays.length === 0 || availableDays.includes(weekday);
}

/**
 * Prende o apaga un día. Todos los días marcados se guardan como null (sin
 * restricción) y no se puede quitar el último: un producto sin días se apaga
 * con el interruptor "Activo".
 */
export function toggleMenuDay(availableDays: number[] | null | undefined, day: number): number[] | null {
  const current = new Set(availableDays && availableDays.length > 0 ? availableDays : MENU_WEEK);
  if (current.has(day)) {
    if (current.size === 1) return [...current];
    current.delete(day);
  } else {
    current.add(day);
  }
  if (current.size === 7) return null;
  return MENU_WEEK.filter((d) => current.has(d));
}

/** "Todos los días" o "lun, jue": para leer de un vistazo. */
export function describeMenuDays(availableDays: number[] | null | undefined): string {
  if (!availableDays || availableDays.length === 0 || availableDays.length === 7) return "Todos los días";
  return MENU_WEEK.filter((d) => availableDays.includes(d))
    .map((d) => WEEKDAY_NAMES[d].slice(0, 3))
    .join(", ");
}

/** Fecha local del negocio, "yyyy-MM-dd" (como la guarda services.sold_out_on). */
export function localDateIn(timezone: string, now = new Date()): string {
  // en-CA formatea como yyyy-MM-dd.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Agotado del día: solo cuenta si se marcó hoy; al día siguiente vuelve solo. */
export function isSoldOut(soldOutOn: string | null | undefined, today: string): boolean {
  return !!soldOutOn && soldOutOn.slice(0, 10) === today;
}

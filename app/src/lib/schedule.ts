import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const BOOKING_ERRORS: Record<string, string> = {
  TIME_BLOCKED: "Ese horario está bloqueado en la agenda (vacaciones, almuerzo o cierre). Elegí otro o quitá el bloqueo.",
  RESERVATION_NOT_AVAILABLE: "Ese horario ya está ocupado. Elegí otro horario o recurso.",
  RESERVATION_IN_PAST: "No se puede reservar en el pasado.",
  RESERVATION_INVALID_RANGE: "El horario no es válido."
};

/** Mensaje para el equipo a partir del error de book_reservation. */
export function bookingErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const code = Object.keys(BOOKING_ERRORS).find((c) => message.includes(c));
  return code ? BOOKING_ERRORS[code] : message || "No se pudo crear la reserva.";
}

export interface BlockForm {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  allDay: boolean;
  startTime: string; // HH:mm
  endTime: string;
}

/**
 * Rango UTC del bloqueo a partir del formulario (fechas/horas en la zona del
 * negocio). "Todo el día" va de las 00:00 del primer día a las 00:00 del día
 * siguiente al último. Devuelve null si el rango no es válido.
 */
export function blockRange(form: BlockForm, timezone: string): { starts_at: string; ends_at: string } | null {
  if (!form.startDate || !form.endDate) return null;
  let start: Date;
  let end: Date;
  if (form.allDay) {
    start = fromZonedTime(`${form.startDate}T00:00:00`, timezone);
    const [y, m, d] = form.endDate.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    end = fromZonedTime(`${next}T00:00:00`, timezone);
  } else {
    if (!form.startTime || !form.endTime) return null;
    start = fromZonedTime(`${form.startDate}T${form.startTime}:00`, timezone);
    end = fromZonedTime(`${form.endDate}T${form.endTime}:00`, timezone);
  }
  if (!(end.getTime() > start.getTime())) return null;
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

/** "lun 6 oct, 12:00 – 13:00" / "6 oct – 10 oct (todo el día)". */
export function formatBlockRange(startsAt: string, endsAt: string, timezone: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const midnight = (d: Date) => formatInTimeZone(d, timezone, "HH:mm") === "00:00";
  if (midnight(start) && midnight(end)) {
    const lastDay = new Date(end.getTime() - 60_000);
    const first = formatInTimeZone(start, timezone, "yyyy-MM-dd");
    const last = formatInTimeZone(lastDay, timezone, "yyyy-MM-dd");
    return first === last ? `${dayEs(start, timezone)} (todo el día)` : `${dayEs(start, timezone)} – ${dayEs(lastDay, timezone)} (todo el día)`;
  }
  const sameDay = formatInTimeZone(start, timezone, "yyyy-MM-dd") === formatInTimeZone(end, timezone, "yyyy-MM-dd");
  const time = (d: Date) => formatInTimeZone(d, timezone, "HH:mm");
  return sameDay
    ? `${dayEs(start, timezone)}, ${time(start)} – ${time(end)}`
    : `${dayEs(start, timezone)} ${time(start)} – ${dayEs(end, timezone)} ${time(end)}`;
}

function dayEs(d: Date, timezone: string): string {
  return d.toLocaleDateString("es-CO", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" });
}

/** Cuántas de estas reservas activas pisan el bloqueo (para avisar al crearlo). */
export function overlappingReservations<T extends { start_at: string; end_at: string; resource_id: string | null; status: string }>(
  reservations: T[],
  block: { starts_at: string; ends_at: string; resource_id: string | null }
): T[] {
  const bs = new Date(block.starts_at).getTime();
  const be = new Date(block.ends_at).getTime();
  return reservations.filter(
    (r) =>
      (r.status === "pending" || r.status === "confirmed") &&
      (block.resource_id === null || r.resource_id === block.resource_id) &&
      new Date(r.start_at).getTime() < be &&
      bs < new Date(r.end_at).getTime()
  );
}

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Lunes primero, como se piensa la semana laboral. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface HourPeriodDraft {
  day_of_week: number;
  opening_time: string; // HH:mm
  closing_time: string;
}

/** Error legible si alguna franja no cierra después de abrir o se solapa con otra del mismo día; null si todo está bien. */
export function validateHourPeriods(periods: HourPeriodDraft[]): string | null {
  for (const day of WEEK_ORDER) {
    const own = periods
      .filter((p) => p.day_of_week === day)
      .map((p) => ({ open: p.opening_time.slice(0, 5), close: p.closing_time.slice(0, 5) }))
      .sort((a, b) => a.open.localeCompare(b.open));
    for (let i = 0; i < own.length; i++) {
      if (!own[i].open || !own[i].close || own[i].close <= own[i].open) {
        return `${DAY_NAMES[day]}: la hora de salida tiene que ser después de la de entrada.`;
      }
      if (i > 0 && own[i].open < own[i - 1].close) return `${DAY_NAMES[day]}: hay franjas que se pisan.`;
    }
  }
  return null;
}

/** "Lun a Vie · 3 franjas" corto para la tabla de recursos. */
export function summarizeHourPeriods(periods: Pick<HourPeriodDraft, "day_of_week">[]): string {
  if (periods.length === 0) return "Horario del negocio";
  const days = WEEK_ORDER.filter((d) => periods.some((p) => p.day_of_week === d));
  return days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
}

export const MAX_WEEKLY_REPEATS = 12;

/**
 * Fechas (YYYY-MM-DD) de una serie semanal que empieza en `startDate`:
 * `weeks` fechas, una cada 7 días. Se trabaja con la fecha de calendario (no
 * sumando 7×24h a un instante), así la hora local se mantiene aunque en
 * medio haya un cambio de horario.
 */
export function weeklyDates(startDate: string, weeks: number): string[] {
  const [y, m, d] = startDate.split("-").map(Number);
  return Array.from({ length: weeks }, (_, i) => new Date(Date.UTC(y, m - 1, d + i * 7)).toISOString().slice(0, 10));
}

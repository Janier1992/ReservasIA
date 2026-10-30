// Horarios del negocio en palabras, para las instrucciones del agente. La
// idea es que el modelo nunca tenga que deducir nada sobre horarios: se le da
// cada día de la semana (con "cerrado" explícito), el horario propio de cada
// recurso y un calendario de los próximos días con su fecha y día de la
// semana ya resueltos. Sin dependencias del server: lo usa systemPrompt.ts,
// que también se publica como Edge Function (agent-preview).
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import type { BusinessHourPeriod, Resource } from "../../types/domain.js";

/** Horario propio de un recurso (resource_hour_periods). */
export interface ResourceHours {
  resource_id: string;
  day_of_week: number;
  opening_time: string;
  closing_time: string;
}

/** Bloqueo de agenda (schedule_blocks): festivo, vacaciones, almuerzo. */
export interface AgendaBlock {
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** Orden en que se lee la semana en Colombia: de lunes a domingo. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const UPCOMING_DAYS = 7;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "09:00:00" → "9:00 a. m."; "18:30" → "6:30 p. m."; "12:00" → "12:00 m." (como se escribe en Colombia). */
export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const minutes = String(m ?? 0).padStart(2, "0");
  if (h === 12 && (m ?? 0) === 0) return "12:00 m.";
  if (h === 0) return `12:${minutes} a. m.`;
  return h < 12 ? `${h}:${minutes} a. m.` : `${h === 12 ? 12 : h - 12}:${minutes} p. m.`;
}

const range = (open: string, close: string) => `${formatClock(open)} a ${formatClock(close)}`;

/** Franjas abiertas de un día del horario del negocio, ordenadas; [] = cerrado. */
function businessRanges(periods: BusinessHourPeriod[], dayOfWeek: number): { open: string; close: string }[] {
  return periods
    .filter((p) => p.day_of_week === dayOfWeek && !p.is_closed && p.opening_time && p.closing_time)
    .map((p) => ({ open: p.opening_time!.slice(0, 5), close: p.closing_time!.slice(0, 5) }))
    .sort((a, b) => a.open.localeCompare(b.open));
}

/**
 * Los siete días, de lunes a domingo. Un día sin horario cargado sale como
 * "cerrado" (igual que lo trata el motor de disponibilidad): el modelo no
 * tiene que suponer nada sobre los días que faltan.
 */
export function formatWeeklyHours(periods: BusinessHourPeriod[]): string {
  if (periods.length === 0) return "No hay horarios configurados: no informes horarios; decile al cliente que se los confirma el negocio.";
  return WEEK_ORDER.map((dow) => {
    const ranges = businessRanges(periods, dow);
    const text = ranges.length > 0 ? ranges.map((r) => range(r.open, r.close)).join(" y de ") : "cerrado";
    return `- ${capitalize(WEEKDAYS[dow])}: ${ranges.length > 0 ? `de ${text}` : text}`;
  }).join("\n");
}

/**
 * Recursos (personal, mesas, bahías) que tienen horario propio: trabajan
 * solo en esas franjas, aunque el negocio esté abierto más horas. Los demás
 * siguen el horario del negocio.
 */
export function formatResourceHours(resources: Resource[], resourceHours: ResourceHours[]): string | null {
  const lines: string[] = [];
  for (const resource of resources) {
    const own = resourceHours.filter((h) => h.resource_id === resource.id);
    if (own.length === 0) continue;
    const days = WEEK_ORDER.filter((dow) => own.some((h) => h.day_of_week === dow)).map((dow) => {
      const ranges = own
        .filter((h) => h.day_of_week === dow)
        .sort((a, b) => a.opening_time.localeCompare(b.opening_time))
        .map((h) => range(h.opening_time.slice(0, 5), h.closing_time.slice(0, 5)));
      return `${WEEKDAYS[dow]} de ${ranges.join(" y de ")}`;
    });
    lines.push(`- ${resource.name}: ${days.join("; ")}; los demás días no atiende`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

/** Fecha local (YYYY-MM-DD) `offset` días después de hoy en la zona del negocio. */
function localDate(nowUtc: Date, timezone: string, offset: number): string {
  const today = formatInTimeZone(nowUtc, timezone, "yyyy-MM-dd");
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

/** Bloqueos de todo el negocio (sin recurso) que tocan el día local `date`. */
function blocksOnDay(blocks: AgendaBlock[], date: string, timezone: string): { from: string; to: string; reason: string | null; wholeDay: boolean }[] {
  const dayStart = fromZonedTime(`${date}T00:00:00`, timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return blocks
    .filter((b) => !b.resource_id && new Date(b.starts_at) < dayEnd && new Date(b.ends_at) > dayStart)
    .map((b) => {
      const start = new Date(Math.max(new Date(b.starts_at).getTime(), dayStart.getTime()));
      const end = new Date(Math.min(new Date(b.ends_at).getTime(), dayEnd.getTime()));
      return {
        from: formatInTimeZone(start, timezone, "HH:mm"),
        to: formatInTimeZone(end, timezone, "HH:mm"),
        reason: b.reason?.trim() || null,
        wholeDay: start.getTime() <= dayStart.getTime() && end.getTime() >= dayEnd.getTime()
      };
    });
}

/**
 * Calendario de los próximos días con la fecha y el día de la semana ya
 * resueltos ("Mañana, viernes 30 de octubre: abierto de 9:00 a. m. a 6:00 p. m.").
 * Es lo que el modelo usa para "¿abren mañana?" o "¿cuándo vuelven a abrir?".
 * Un bloqueo de todo el negocio que cubre el día lo deja cerrado.
 */
export function formatUpcomingDays(nowUtc: Date, timezone: string, periods: BusinessHourPeriod[], blocks: AgendaBlock[]): string {
  const lines: string[] = [];
  for (let offset = 0; offset < UPCOMING_DAYS; offset++) {
    const date = localDate(nowUtc, timezone, offset);
    const noon = fromZonedTime(`${date}T12:00:00`, timezone);
    const label = formatInTimeZone(noon, timezone, "EEEE d 'de' MMMM", { locale: es });
    const prefix = offset === 0 ? `Hoy, ${label}` : offset === 1 ? `Mañana, ${label}` : capitalize(label);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const ranges = businessRanges(periods, dow);
    const dayBlocks = blocksOnDay(blocks, date, timezone);

    let status: string;
    if (ranges.length === 0) status = "cerrado";
    else if (dayBlocks.some((b) => b.wholeDay)) {
      const reason = dayBlocks.find((b) => b.wholeDay)?.reason;
      status = `cerrado${reason ? ` (${reason})` : ""} aunque normalmente abre`;
    } else {
      status = `abierto de ${ranges.map((r) => range(r.open, r.close)).join(" y de ")}`;
      const partial = dayBlocks.map((b) => `de ${formatClock(b.from)} a ${formatClock(b.to)}${b.reason ? ` (${b.reason})` : ""}`);
      if (partial.length > 0) status += `, pero sin atención ${partial.join(" y ")}`;
    }
    lines.push(`- ${prefix} (${date}): ${status}`);
  }
  return lines.join("\n");
}

/** "jueves 29 de octubre de 2026, 8:45 p. m." en la zona del negocio. */
export function formatNow(nowUtc: Date, timezone: string): string {
  const day = formatInTimeZone(nowUtc, timezone, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  return `${day}, ${formatClock(formatInTimeZone(nowUtc, timezone, "HH:mm"))}`;
}

/**
 * Un instante (ISO, UTC) como lo entiende el cliente, en la zona del negocio.
 * Las herramientas del agente devuelven esto y no la hora UTC: si el modelo
 * tuviera que restar la diferencia horaria, a veces no lo hace (las 9:00 a. m.
 * de Bogotá son las 14:00 UTC y terminaba diciendo que el horario es "de noche").
 */
export function localMoment(iso: string, timezone: string): { fecha: string; hora: string; cuando: string } {
  const date = new Date(iso);
  const day = formatInTimeZone(date, timezone, "EEEE d 'de' MMMM", { locale: es });
  const hora = formatInTimeZone(date, timezone, "HH:mm");
  return { fecha: formatInTimeZone(date, timezone, "yyyy-MM-dd"), hora, cuando: `${day} a las ${formatClock(hora)}` };
}

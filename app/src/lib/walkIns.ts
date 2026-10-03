import type { WalkIn } from "@/types/domain";

/** "#007": número de ticket del día en Atención en sitio (vuelve a 1 cada día). */
export function formatTicket(ticketNumber: number | null | undefined): string {
  return ticketNumber ? `#${String(ticketNumber).padStart(3, "0")}` : "";
}

export function minutesBetween(from: string, to: Date | string): number {
  const end = typeof to === "string" ? new Date(to) : to;
  return Math.max(0, Math.floor((end.getTime() - new Date(from).getTime()) / 60_000));
}

export function formatWait(minutes: number): string {
  if (minutes < 1) return "recién llegó";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export interface WalkInStats {
  waiting: number;
  inService: number;
  done: number;
  left: number;
  averageWaitMinutes: number | null;
}

/** Resumen del día: cuántos hay en cada estado y la espera promedio de los ya atendidos. */
export function walkInStats(walkIns: WalkIn[]): WalkInStats {
  const stats: WalkInStats = { waiting: 0, inService: 0, done: 0, left: 0, averageWaitMinutes: null };
  let waitTotal = 0;
  let waitCount = 0;
  for (const w of walkIns) {
    if (w.status === "waiting") stats.waiting++;
    else if (w.status === "in_service") stats.inService++;
    else if (w.status === "done") stats.done++;
    else stats.left++;
    if (w.served_at) {
      waitTotal += minutesBetween(w.arrived_at, w.served_at);
      waitCount++;
    }
  }
  if (waitCount > 0) stats.averageWaitMinutes = Math.round(waitTotal / waitCount);
  return stats;
}

export interface NotifyStatus {
  label: string;
  variant: "success" | "warning" | "destructive" | "muted" | "default";
}

const CHANNEL_LABEL = { telegram: "Telegram", whatsapp: "WhatsApp" } as const;

/**
 * Estado del aviso de "listo" para mostrar en la fila. null cuando no aplica
 * (registro del equipo sin canal y todavía no marcado listo).
 */
export function notifyStatus(w: Pick<WalkIn, "source" | "notify_channel" | "ready_at" | "notified_at" | "notify_error">): NotifyStatus | null {
  const channel = w.notify_channel ? CHANNEL_LABEL[w.notify_channel] : null;
  if (w.ready_at) {
    if (w.notify_error) return { label: "No se pudo avisar", variant: "destructive" };
    if (w.notified_at) return { label: `Avisado por ${channel ?? "chat"}`, variant: "success" };
    if (channel) return { label: "Avisando…", variant: "warning" };
    return { label: "Listo · llamalo en persona", variant: "muted" };
  }
  if (channel) return { label: `Aviso por ${channel}`, variant: "default" };
  if (w.source === "qr") return { label: "Sin aviso", variant: "muted" };
  return null;
}

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Solo el dueño o un administrador puede hacer esto.",
  RESERVATION_NOT_AVAILABLE: "Ese recurso está ocupado en este momento. Elegí otro o esperá a que se libere.",
  TIME_BLOCKED: "Ese recurso tiene la agenda bloqueada ahora (almuerzo, vacaciones). Elegí otro o quitá el bloqueo.",
  WALK_IN_NOT_WAITING: "Esta llegada ya fue atendida por otra persona del equipo.",
  WALK_IN_NOT_IN_SERVICE: "Esta atención ya fue finalizada.",
  WALK_IN_NOT_FOUND: "No se encontró esta llegada. Recargá la página.",
  RESERVATION_NOT_MODIFIABLE: "Esa reserva ya no está activa (fue cancelada o completada). Recargá la página.",
  RESERVATION_NOT_FOUND: "No se encontró la reserva. Recargá la página."
};

/** Traduce los códigos de error de serve_walk_in / finish_walk_in a un mensaje para el equipo. */
export function walkInErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const code = Object.keys(ERROR_MESSAGES).find((c) => message.includes(c));
  return code ? ERROR_MESSAGES[code] : message || "No se pudo actualizar la atención.";
}

export interface ServiceProgress {
  /** Minutos desde que pasó a atención. */
  elapsed: number;
  /** Duración esperada en minutos; null si no se conoce (pedido sin servicio). */
  expected: number | null;
  /** Minutos que faltan (negativo: pasado de tiempo). null sin duración esperada. */
  remaining: number | null;
  /** Avance de 0 a 1 para la barra; null sin duración esperada. */
  ratio: number | null;
  overdue: boolean;
}

/**
 * Cuánto lleva una atención frente a lo que debería durar: la duración del
 * servicio o, si llegó con reserva, lo que dura esa reserva.
 */
export function serviceProgress(
  w: Pick<WalkIn, "served_at" | "arrived_at" | "services" | "reservations">,
  now: Date
): ServiceProgress {
  const elapsed = minutesBetween(w.served_at ?? w.arrived_at, now);
  const reservation = w.reservations;
  const fromReservation =
    reservation?.start_at && reservation.end_at ? Math.round((new Date(reservation.end_at).getTime() - new Date(reservation.start_at).getTime()) / 60_000) : null;
  const expected = w.services?.duration_minutes || fromReservation || null;
  if (!expected || expected <= 0) return { elapsed, expected: null, remaining: null, ratio: null, overdue: false };
  return { elapsed, expected, remaining: expected - elapsed, ratio: Math.min(1, elapsed / expected), overdue: elapsed > expected };
}

/** Título grande de la tarjeta: la placa, la mascota o el estudiante de la reserva, si hay. */
export function walkInAssetLabel(w: Pick<WalkIn, "reservations">): string | null {
  return w.reservations?.customer_assets?.label?.trim() || null;
}

/**
 * Qué tan apretado va el tablero: con pocas atenciones las tarjetas son
 * grandes; a medida que llegan más se achican para que quepan más en pantalla.
 */
export type BoardDensity = "comfortable" | "compact" | "dense";

export function boardDensity(activeCount: number): BoardDensity {
  if (activeCount <= 6) return "comfortable";
  if (activeCount <= 12) return "compact";
  return "dense";
}

/** Tamaño de cada tarjeta: el modo pantalla arranca un paso más grande. */
export type CardSize = "lg" | "md" | "sm" | "xs";

const CARD_SIZES: CardSize[] = ["lg", "md", "sm", "xs"];
const DENSITY_STEP: Record<BoardDensity, number> = { comfortable: 0, compact: 1, dense: 2 };

export function cardSizeFor(density: BoardDensity, display: boolean): CardSize {
  return CARD_SIZES[Math.min(CARD_SIZES.length - 1, (display ? 0 : 1) + DENSITY_STEP[density])];
}

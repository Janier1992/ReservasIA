import type { WalkIn } from "@/types/domain";

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

const ERROR_MESSAGES: Record<string, string> = {
  RESERVATION_NOT_AVAILABLE: "Ese recurso está ocupado en este momento. Elegí otro o esperá a que se libere.",
  WALK_IN_NOT_WAITING: "Esta llegada ya fue atendida por otra persona del equipo.",
  WALK_IN_NOT_IN_SERVICE: "Esta atención ya fue finalizada.",
  WALK_IN_NOT_FOUND: "No se encontró esta llegada. Recargá la página."
};

/** Traduce los códigos de error de serve_walk_in / finish_walk_in a un mensaje para el equipo. */
export function walkInErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const code = Object.keys(ERROR_MESSAGES).find((c) => message.includes(c));
  return code ? ERROR_MESSAGES[code] : message || "No se pudo actualizar la atención.";
}

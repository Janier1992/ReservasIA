/**
 * Etapas de atención por rubro (reservations.stage). Son el flujo propio de
 * cada negocio, además del estado de la reserva: un taller necesita saber
 * si el carro está en diagnóstico o esperando que el cliente apruebe la
 * cotización; un restaurante, si la mesa ya se sentó. La base solo guarda
 * la clave (formato ^[a-z_]+$); el significado vive acá.
 */

export interface WorkflowStage {
  key: string;
  label: string;
}

export interface Workflow {
  stages: WorkflowStage[];
  /** Etapa en la que conviene avisarle al cliente (ej. "listo para entregar"). */
  notifyStage?: string;
  /** Mensaje sugerido al llegar a notifyStage. {nombre} y {negocio} se reemplazan. */
  notifyMessage?: string;
}

const WORKFLOWS: Record<string, Workflow> = {
  auto_repair: {
    stages: [
      { key: "received", label: "Recibido" },
      { key: "diagnosis", label: "Diagnóstico" },
      { key: "quote_sent", label: "Cotización enviada" },
      { key: "approved", label: "Aprobado" },
      { key: "in_progress", label: "En reparación" },
      { key: "ready", label: "Listo para entregar" }
    ],
    notifyStage: "ready",
    notifyMessage: "Hola {nombre}, tu vehículo ya está listo para entregar en {negocio}. ¡Te esperamos!"
  },
  car_wash: {
    stages: [
      { key: "queued", label: "En fila" },
      { key: "washing", label: "Lavando" },
      { key: "detailing", label: "Secado y detalle" },
      { key: "ready", label: "Listo para entregar" }
    ],
    notifyStage: "ready",
    notifyMessage: "Hola {nombre}, tu vehículo ya está limpio y listo en {negocio}. ¡Te esperamos!"
  },
  veterinary: {
    stages: [
      { key: "waiting", label: "En sala de espera" },
      { key: "in_consult", label: "En consulta" },
      { key: "observation", label: "En observación" },
      { key: "ready", label: "Lista para recoger" }
    ],
    notifyStage: "ready",
    notifyMessage: "Hola {nombre}, tu mascota ya está lista para recoger en {negocio}."
  },
  restaurant: {
    stages: [
      { key: "booked", label: "Reservada" },
      { key: "seated", label: "Sentados" },
      { key: "check_requested", label: "Cuenta pedida" },
      { key: "left", label: "Mesa liberada" }
    ]
  }
};

/** Flujo del rubro, o null si el rubro trabaja solo con el estado de la reserva. */
export function getWorkflow(businessType: string | null | undefined): Workflow | null {
  return (businessType && WORKFLOWS[businessType]) || null;
}

/** Etapa actual; una reserva sin etapa está en la primera. */
export function currentStage(workflow: Workflow, stage: string | null | undefined): WorkflowStage {
  return workflow.stages.find((s) => s.key === stage) ?? workflow.stages[0];
}

export function adjacentStage(workflow: Workflow, stage: string | null | undefined, direction: 1 | -1): WorkflowStage | null {
  const index = workflow.stages.indexOf(currentStage(workflow, stage));
  return workflow.stages[index + direction] ?? null;
}

export function fillNotifyMessage(template: string, customerName: string | null | undefined, businessName: string): string {
  const firstName = (customerName ?? "").trim().split(/\s+/)[0] || "";
  return template
    .replace("{nombre}", firstName)
    .replace("{negocio}", businessName)
    .replace(/\s+,/g, ",")
    .replace(/Hola ,/, "Hola,");
}

interface BoardItem {
  status: string;
  start_at: string;
  stage?: string | null;
}

const BOARD_DAYS_AHEAD = 7;

/**
 * Qué entra al tablero: reservas activas de hoy a 7 días, más las que ya
 * avanzaron de la primera etapa aunque sean de días anteriores (un carro
 * puede pasar varios días en reparación). Una reserva vieja que nadie
 * movió de la primera etapa no ensucia el tablero.
 */
export function boardReservations<T extends BoardItem>(workflow: Workflow, reservations: T[], now = new Date()): T[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const horizon = startOfToday.getTime() + (BOARD_DAYS_AHEAD + 1) * 24 * 60 * 60 * 1000;
  const firstStage = workflow.stages[0].key;
  return reservations.filter((r) => {
    if (r.status !== "pending" && r.status !== "confirmed") return false;
    const start = new Date(r.start_at).getTime();
    const inWindow = start >= startOfToday.getTime() && start < horizon;
    const inProgress = currentStage(workflow, r.stage).key !== firstStage;
    return inWindow || inProgress;
  });
}

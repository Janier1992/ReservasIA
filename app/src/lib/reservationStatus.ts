import type { ReservationStatus } from "@/types/domain";

// Fuente única para el label/color de cada estado de reserva. Antes cada
// pantalla que mostraba un estado (Reservas, Clientes, Inbox) tenía su propia
// copia parcial de este mapeo — algunas mostraban el valor crudo en inglés
// ("confirmed") en vez del label traducido, y quedaba inconsistente entre
// pantallas.
export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No asistió"
};

export const RESERVATION_STATUS_VARIANT: Record<ReservationStatus, "default" | "success" | "warning" | "destructive" | "muted"> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "destructive",
  completed: "muted",
  no_show: "destructive"
};

export function reservationStatusLabel(status: string): string {
  return RESERVATION_STATUS_LABEL[status as ReservationStatus] ?? status;
}

export function reservationStatusVariant(status: string): "default" | "success" | "warning" | "destructive" | "muted" {
  return RESERVATION_STATUS_VARIANT[status as ReservationStatus] ?? "muted";
}

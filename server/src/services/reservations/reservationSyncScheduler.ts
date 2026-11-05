import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { createScheduledJob } from "../../lib/scheduledJob.js";
import type { Reservation } from "../../types/domain.js";
import { announceCancelledReservation, announceCreatedReservation, claimReservationSync } from "./reservationsService.js";

/**
 * El panel crea y cancela reservas directo en la base, sin pasar por el
 * server, así que nadie le mandaba el correo al cliente ni tocaba Google
 * Calendar. Esta tarea revisa cada pocos segundos lo que quedó pendiente
 * (ver migración 20261028090000_reservation-sync-marks.sql) y avisa.
 */
const CHECK_INTERVAL_MS = 15_000;
/** Lo que quedó pendiente hace más de esto ya no se avisa (el server estuvo caído un día entero). */
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 50;

export async function syncPanelReservations(now = new Date()): Promise<{ created: number; cancelled: number }> {
  const since = new Date(now.getTime() - MAX_PENDING_AGE_MS).toISOString();
  let created = 0;
  let cancelled = 0;

  const newOnes = await insforgeAdmin.database
    .from("reservations")
    .select("*")
    .eq("source", "dashboard")
    .is("created_sync_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (newOnes.error) {
    logger.warn({ err: newOnes.error }, "reservation_sync_query_failed");
    return { created, cancelled };
  }
  for (const reservation of (newOnes.data ?? []) as Reservation[]) {
    if (!(await claimReservationSync(reservation.id, "created_sync_at", { onError: "skip", now }))) continue;
    if (reservation.status === "cancelled") {
      // Se creó y se canceló antes de que llegara esta vuelta: el cliente no
      // recibe ni la confirmación ni la cancelación.
      await claimReservationSync(reservation.id, "cancelled_sync_at", { onError: "skip", now });
      continue;
    }
    await announceCreatedReservation(reservation);
    created++;
  }

  // Cancelaciones hechas desde el panel de reservas que sí se habían
  // avisado (por el panel, el chat o la página pública).
  const cancelledOnes = await insforgeAdmin.database
    .from("reservations")
    .select("*")
    .eq("status", "cancelled")
    .is("cancelled_sync_at", null)
    .not("created_sync_at", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (cancelledOnes.error) {
    logger.warn({ err: cancelledOnes.error }, "reservation_sync_query_failed");
    return { created, cancelled };
  }
  for (const reservation of (cancelledOnes.data ?? []) as Reservation[]) {
    if (!(await claimReservationSync(reservation.id, "cancelled_sync_at", { onError: "skip", now }))) continue;
    await announceCancelledReservation(reservation);
    cancelled++;
  }

  if (created || cancelled) logger.info({ created, cancelled }, "reservation_sync_batch_done");
  return { created, cancelled };
}

const job = createScheduledJob("reservation_sync", CHECK_INTERVAL_MS, syncPanelReservations);

export function startReservationSyncScheduler(): void {
  job.start();
}

export function stopReservationSyncScheduler(): void {
  job.stop();
}

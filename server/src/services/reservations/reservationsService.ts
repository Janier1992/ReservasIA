import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { AppError, ErrorCodes, mapPostgresErrorMessage } from "../../utils/AppError.js";
import type { Reservation } from "../../types/domain.js";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "../google/googleService.js";
import { notifyNewReservation } from "../notifications/pushService.js";
import { sendReservationEmail } from "../notifications/reservationEmailService.js";

function translateRpcError(error: { message: string }): never {
  const mapped = mapPostgresErrorMessage(error.message);
  if (mapped) throw mapped;
  throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo completar la operación de reserva.", 500);
}

export type ReservationSyncMark = "created_sync_at" | "cancelled_sync_at";

/**
 * Marca que la reserva ya pasó por el aviso al cliente (correo + Google
 * Calendar). Es un update condicional: si el server y la tarea que revisa lo
 * hecho desde el panel la toman a la vez, solo uno avisa. Si la marca no se
 * puede guardar, `onError` decide: el chat y la página pública avisan igual
 * (mejor un correo que ninguno); la tarea periódica no, porque reintentaría
 * en cada vuelta.
 */
export async function claimReservationSync(
  reservationId: string,
  mark: ReservationSyncMark,
  { onError, now = new Date() }: { onError: "announce" | "skip"; now?: Date }
): Promise<boolean> {
  const { data, error } = await insforgeAdmin.database
    .from("reservations")
    .update({ [mark]: now.toISOString() })
    .eq("id", reservationId)
    .is(mark, null)
    .select("id");
  if (error) {
    logger.warn({ reservationId, mark, err: error }, "reservation_sync_mark_failed");
    return onError === "announce";
  }
  return Array.isArray(data) && data.length > 0;
}

/** Correo de confirmación al cliente y evento en el Google Calendar del negocio. */
export async function announceCreatedReservation(reservation: Reservation): Promise<void> {
  // Primero el correo con la marca del negocio: si sale, Google no manda
  // además su invitación genérica (el cliente recibe un solo correo).
  const emailed = await sendReservationEmail(reservation, "confirmed");

  // Google Calendar es best-effort: si falla, la reserva permanece creada
  // (punto 23 del prompt). El error queda registrado pero no se propaga.
  try {
    const googleEventId = await createCalendarEvent(reservation, { notifyCustomer: !emailed });
    if (googleEventId) {
      await insforgeAdmin.database.from("reservations").update({ google_event_id: googleEventId }).eq("id", reservation.id);
      reservation.google_event_id = googleEventId;
    }
  } catch (googleError) {
    logger.warn(
      { organizationId: reservation.organization_id, reservationId: reservation.id, err: googleError },
      "google_calendar_sync_failed_on_create"
    );
  }
}

/** Correo de cancelación al cliente y baja del evento en Google Calendar. */
export async function announceCancelledReservation(reservation: Reservation): Promise<void> {
  const emailed = await sendReservationEmail(reservation, "cancelled");
  if (!reservation.google_event_id) return;
  try {
    await deleteCalendarEvent(reservation.organization_id, reservation.google_event_id, { notifyCustomer: !emailed });
  } catch (googleError) {
    logger.warn(
      { organizationId: reservation.organization_id, reservationId: reservation.id, err: googleError },
      "google_calendar_sync_failed_on_cancel"
    );
  }
}

export interface CreateReservationInput {
  organizationId: string;
  customerId: string | null;
  serviceId: string | null;
  resourceId: string | null;
  conversationId: string | null;
  startAt: Date;
  endAt: Date;
  partySize: number | null;
  customerName: string | null;
  specialRequests: string | null;
  source?: string;
  recurrenceGroupId?: string | null;
}

export async function createReservation(input: CreateReservationInput): Promise<Reservation> {
  const { data, error } = await insforgeAdmin.database.rpc("book_reservation", {
    p_organization_id: input.organizationId,
    p_customer_id: input.customerId,
    p_service_id: input.serviceId,
    p_resource_id: input.resourceId,
    p_conversation_id: input.conversationId,
    p_start_at: input.startAt.toISOString(),
    p_end_at: input.endAt.toISOString(),
    p_party_size: input.partySize,
    p_customer_name: input.customerName,
    p_special_requests: input.specialRequests,
    p_source: input.source ?? "whatsapp",
    p_recurrence_group_id: input.recurrenceGroupId ?? null
  });

  if (error) translateRpcError(error);
  const reservation = data as Reservation;

  if (await claimReservationSync(reservation.id, "created_sync_at", { onError: "announce" })) {
    await announceCreatedReservation(reservation);
  }

  // Push al negocio: igual que Google Calendar, best-effort — el dueño se
  // entera al instante de que el agente cerró una reserva por su cuenta,
  // sin que eso pueda bloquear ni fallar la creación de la reserva en sí.
  try {
    await notifyNewReservation(reservation);
  } catch (pushError) {
    logger.warn({ organizationId: input.organizationId, reservationId: reservation.id, err: pushError }, "push_notify_failed");
  }

  return reservation;
}

export async function cancelReservation(reservationId: string): Promise<Reservation> {
  const { data, error } = await insforgeAdmin.database.rpc("cancel_reservation", { p_reservation_id: reservationId });
  if (error) translateRpcError(error);
  const reservation = data as Reservation;
  // Si ya estaba cancelada (y avisada), no se le escribe de nuevo al cliente.
  if (await claimReservationSync(reservation.id, "cancelled_sync_at", { onError: "announce" })) {
    await announceCancelledReservation(reservation);
  }
  return reservation;
}

export async function rescheduleReservation(
  reservationId: string,
  newStartAt: Date,
  newEndAt: Date
): Promise<Reservation> {
  const { data, error } = await insforgeAdmin.database.rpc("reschedule_reservation", {
    p_reservation_id: reservationId,
    p_new_start_at: newStartAt.toISOString(),
    p_new_end_at: newEndAt.toISOString()
  });
  if (error) translateRpcError(error);
  const reservation = data as Reservation;
  const emailed = await sendReservationEmail(reservation, "rescheduled");

  if (reservation.google_event_id) {
    try {
      await updateCalendarEvent(reservation, { notifyCustomer: !emailed });
    } catch (googleError) {
      logger.warn(
        { organizationId: reservation.organization_id, reservationId: reservation.id, err: googleError },
        "google_calendar_sync_failed_on_reschedule"
      );
    }
  }

  return reservation;
}

/**
 * Cuando el cliente manda la foto del comprobante, buscamos su reserva más
 * próxima que esté esperando ese pago y la pasamos a "awaiting_confirmation"
 * (esperando que un humano del negocio la revise). Nunca la pasamos
 * directamente a "paid": eso solo lo hace el staff desde el dashboard
 * (punto 27 de las reglas del agente).
 */
export async function markAwaitingPaymentAsAwaitingConfirmation(
  organizationId: string,
  customerId: string
): Promise<Reservation | null> {
  const { data: candidate } = await insforgeAdmin.database
    .from("reservations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("payment_status", "awaiting_payment")
    .in("status", ["pending", "confirmed"])
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!candidate) return null;

  const { data: updated, error } = await insforgeAdmin.database
    .from("reservations")
    .update({ payment_status: "awaiting_confirmation" })
    .eq("id", candidate.id)
    .select("*")
    .single();

  if (error || !updated) return null;
  return updated as Reservation;
}

export async function getReservationById(organizationId: string, reservationId: string): Promise<Reservation> {
  const { data, error } = await insforgeAdmin.database
    .from("reservations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo cargar la reserva.", 500);
  if (!data) throw new AppError(ErrorCodes.RESERVATION_NOT_FOUND, "La reserva no existe.", 404);
  return data as Reservation;
}

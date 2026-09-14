import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { AppError, ErrorCodes, mapPostgresErrorMessage } from "../../utils/AppError.js";
import type { Reservation } from "../../types/domain.js";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "../google/googleService.js";
import { notifyNewReservation } from "../notifications/pushService.js";

function translateRpcError(error: { message: string }): never {
  const mapped = mapPostgresErrorMessage(error.message);
  if (mapped) throw mapped;
  throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo completar la operación de reserva.", 500);
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
    p_source: input.source ?? "whatsapp"
  });

  if (error) translateRpcError(error);
  const reservation = data as Reservation;

  // Google Calendar es best-effort: si falla, la reserva permanece creada
  // (punto 23 del prompt). El error queda registrado pero no se propaga.
  try {
    const googleEventId = await createCalendarEvent(reservation);
    if (googleEventId) {
      await insforgeAdmin.database
        .from("reservations")
        .update({ google_event_id: googleEventId })
        .eq("id", reservation.id);
      reservation.google_event_id = googleEventId;
    }
  } catch (googleError) {
    logger.warn(
      { organizationId: input.organizationId, reservationId: reservation.id, err: googleError },
      "google_calendar_sync_failed_on_create"
    );
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

  if (reservation.google_event_id) {
    try {
      await deleteCalendarEvent(reservation.organization_id, reservation.google_event_id);
    } catch (googleError) {
      logger.warn(
        { organizationId: reservation.organization_id, reservationId: reservation.id, err: googleError },
        "google_calendar_sync_failed_on_cancel"
      );
    }
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

  if (reservation.google_event_id) {
    try {
      await updateCalendarEvent(reservation);
    } catch (googleError) {
      logger.warn(
        { organizationId: reservation.organization_id, reservationId: reservation.id, err: googleError },
        "google_calendar_sync_failed_on_reschedule"
      );
    }
  }

  return reservation;
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

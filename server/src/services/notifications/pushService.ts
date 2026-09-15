import webpush from "web-push";
import { env } from "../../config/env.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import type { Reservation } from "../../types/domain.js";

const vapidConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function loadSubscriptions(organizationId: string): Promise<PushSubscriptionRow[]> {
  const { data, error } = await insforgeAdmin.database
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("organization_id", organizationId);
  if (error) {
    logger.warn({ organizationId, err: error }, "push_load_subscriptions_failed");
    return [];
  }
  return (data ?? []) as PushSubscriptionRow[];
}

async function removeSubscription(id: string): Promise<void> {
  await insforgeAdmin.database.from("push_subscriptions").delete().eq("id", id);
}

interface WebPushError {
  statusCode?: number;
  body?: string;
  headers?: Record<string, string>;
}

async function sendToSubscription(sub: PushSubscriptionRow, payload: string): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    return true;
  } catch (err: unknown) {
    const { statusCode, body, headers } = err as WebPushError;
    // 404/410: el navegador invalidó ese endpoint (desinstaló la app, borró
    // datos del sitio, etc.) — limpiamos la suscripción muerta para no
    // seguir intentando mandarle push por siempre.
    if (statusCode === 404 || statusCode === 410) {
      await removeSubscription(sub.id);
      logger.warn({ subscriptionId: sub.id }, "push_subscription_expired_removed");
      return false;
    }
    // `body` es el motivo real que devuelve el servicio de push del
    // navegador (FCM/Mozilla/etc.) — por ejemplo "VAPID credential
    // mismatch" cuando la clave pública del frontend y la privada del
    // servidor no son del mismo par. statusCode solo no alcanza para
    // diagnosticar, por eso se loguea completo.
    logger.warn({ subscriptionId: sub.id, statusCode, body, headers }, "push_send_failed");
    return false;
  }
}

/**
 * Best-effort, nunca bloquea ni revienta el flujo de reservas: si no hay
 * VAPID configurado, o no hay suscripciones, o falla el envío, la reserva
 * ya quedó creada de todas formas (mismo criterio que la sincronización
 * con Google Calendar).
 */
export async function notifyNewReservation(reservation: Reservation): Promise<void> {
  if (!vapidConfigured) {
    logger.warn({ organizationId: reservation.organization_id }, "push_skipped_vapid_not_configured");
    return;
  }

  const subscriptions = await loadSubscriptions(reservation.organization_id);
  if (subscriptions.length === 0) {
    logger.info({ organizationId: reservation.organization_id }, "push_skipped_no_subscriptions");
    return;
  }

  const payload = JSON.stringify({
    title: "Nueva reserva confirmada",
    body: reservation.customer_name
      ? `${reservation.customer_name} reservó para ${new Date(reservation.start_at).toLocaleString("es-CO")}`
      : `Reserva confirmada para ${new Date(reservation.start_at).toLocaleString("es-CO")}`,
    url: "/dashboard/reservations",
    tag: `reservation-${reservation.id}`
  });

  const results = await Promise.all(subscriptions.map((sub) => sendToSubscription(sub, payload)));
  const sent = results.filter(Boolean).length;
  logger.info(
    { organizationId: reservation.organization_id, reservationId: reservation.id, sent, total: subscriptions.length },
    "push_notify_new_reservation_done"
  );
}

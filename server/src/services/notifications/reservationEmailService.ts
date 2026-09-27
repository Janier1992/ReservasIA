import { env } from "../../config/env.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { sendEmail } from "../../lib/mailer.js";
import type { Reservation } from "../../types/domain.js";
import { buildReservationEmail, type ReservationEmailKind } from "./reservationEmailTemplate.js";

const pick = <T>(row: unknown) => (row ?? null) as T | null;

/**
 * Envía al cliente el correo de su reserva con la marca del negocio. Devuelve
 * true si salió: en ese caso Google Calendar no le manda además su propia
 * invitación (ver reservationsService). Nunca lanza: si no hay email o el
 * envío falla, la reserva sigue igual y Google queda como respaldo.
 */
export async function sendReservationEmail(reservation: Reservation, kind: ReservationEmailKind): Promise<boolean> {
  if (!reservation.customer_id) return false;
  try {
    const [customer, profile, org, service] = await Promise.all([
      insforgeAdmin.database.from("customers").select("email, name").eq("id", reservation.customer_id).maybeSingle(),
      insforgeAdmin.database
        .from("business_profiles")
        .select("name, logo_url, tagline, address, phone, email, cancellation_policy")
        .eq("organization_id", reservation.organization_id)
        .maybeSingle(),
      insforgeAdmin.database.from("organizations").select("name, timezone").eq("id", reservation.organization_id).maybeSingle(),
      reservation.service_id
        ? insforgeAdmin.database.from("services").select("name").eq("id", reservation.service_id).maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const c = pick<{ email: string | null; name: string | null }>(customer.data);
    if (!c?.email) return false;
    const p = pick<{
      name: string;
      logo_url: string | null;
      tagline: string | null;
      address: string | null;
      phone: string | null;
      email: string | null;
      cancellation_policy: string | null;
    }>(profile.data);
    const o = pick<{ name: string; timezone: string | null }>(org.data);
    const s = pick<{ name: string }>(service.data);

    const { subject, html } = buildReservationEmail({
      kind,
      business: {
        name: p?.name ?? o?.name ?? "Tu reserva",
        logoUrl: p?.logo_url ?? null,
        slogan: p?.tagline?.trim() || null,
        address: p?.address ?? null,
        phone: p?.phone ?? null
      },
      cancellationPolicy: p?.cancellation_policy?.trim() || null,
      customerName: reservation.customer_name ?? c.name,
      serviceName: s?.name ?? null,
      startAt: reservation.start_at,
      endAt: reservation.end_at,
      timezone: o?.timezone ?? env.DEFAULT_TIMEZONE,
      partySize: reservation.party_size,
      notes: reservation.special_requests
    });

    // Sale a nombre del negocio; si el cliente responde, le llega al negocio.
    await sendEmail({ to: c.email, subject, html, fromName: p?.name ?? o?.name, replyTo: p?.email?.trim() || undefined });
    return true;
  } catch (err) {
    logger.warn({ reservationId: reservation.id, kind, err }, "reservation_email_failed");
    return false;
  }
}

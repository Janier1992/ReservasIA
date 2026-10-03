import { addMinutes } from "date-fns";
import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import { getAvailableSlots } from "../availability/availabilityService.js";
import { findOrCreateCustomerByPhone } from "../customers/customersService.js";
import { createReservation } from "../reservations/reservationsService.js";
import { requiresHealthDataConsent } from "../agent/safetyGuardrails.js";
import { createReservationChatLink } from "../chatLink/reservationLink.js";

/**
 * Página pública de reservas (/r/:slug): lo que ve y puede hacer alguien
 * SIN cuenta. Todo pasa por acá con la clave admin, así que este servicio
 * es la frontera de seguridad: solo expone negocios activos con el módulo
 * public_booking encendido, solo datos pensados para mostrarse (nunca
 * clientes, reservas ajenas ni credenciales), y reserva únicamente en un
 * horario que el motor de disponibilidad confirme libre en ese momento.
 */

/**
 * Rubros donde el QR es para pedir YA (comida rápida, restaurante) y no para
 * reservar con hora: el pedido entra a la fila de Atención en sitio, así que
 * ese módulo tiene que estar encendido.
 */
const ORDER_MODE_BUSINESS_TYPES = new Set(["restaurant"]);

export type PublicPageMode = "order" | "booking";

export function publicPageMode(businessType: string, disabledModules: readonly string[]): PublicPageMode {
  return ORDER_MODE_BUSINESS_TYPES.has(businessType) && !disabledModules.includes("walk_ins") ? "order" : "booking";
}

export interface PublicBusiness {
  organizationId: string;
  slug: string;
  mode: PublicPageMode;
  businessType: string;
  timezone: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  maxBookingDays: number;
  services: { id: string; name: string; description: string | null; durationMinutes: number; price: number | null; currency: string }[];
}

const NOT_AVAILABLE = () =>
  new AppError(ErrorCodes.ORGANIZATION_NOT_FOUND, "Este negocio no tiene reservas en línea disponibles.", 404);

export async function resolveOrganization(slug: string) {
  const { data: org, error } = await insforgeAdmin.database
    .from("organizations")
    .select("id, slug, business_type, timezone, status, disabled_modules")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo cargar el negocio.", 500);
  const disabled: string[] = org?.disabled_modules ?? [];
  // Mismo 404 para "no existe", "suspendido" y "módulo apagado": no revela
  // qué negocios existen ni su estado de cuenta.
  if (!org || org.status !== "active" || disabled.includes("public_booking")) throw NOT_AVAILABLE();
  return { ...(org as { id: string; slug: string; business_type: string; timezone: string }), disabled_modules: disabled };
}

export async function getPublicBusiness(slug: string): Promise<PublicBusiness> {
  const org = await resolveOrganization(slug);

  const [{ data: profile }, { data: services, error: servicesError }] = await Promise.all([
    insforgeAdmin.database
      .from("business_profiles")
      .select("name, description, address, phone, logo_url, max_booking_days")
      .eq("organization_id", org.id)
      .maybeSingle(),
    insforgeAdmin.database
      .from("services")
      .select("id, name, description, duration_minutes, price, currency")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
  ]);
  if (!profile || servicesError) throw NOT_AVAILABLE();

  return {
    organizationId: org.id,
    slug: org.slug,
    mode: publicPageMode(org.business_type, org.disabled_modules),
    businessType: org.business_type,
    timezone: org.timezone,
    name: profile.name,
    description: profile.description ?? null,
    address: profile.address ?? null,
    phone: profile.phone ?? null,
    logoUrl: profile.logo_url ?? null,
    maxBookingDays: profile.max_booking_days ?? 30,
    services: (services ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
      description: (s.description as string | null) ?? null,
      durationMinutes: s.duration_minutes as number,
      price: (s.price as number | null) ?? null,
      currency: s.currency as string
    }))
  };
}

export async function assertActiveService(organizationId: string, serviceId: string) {
  const { data: service } = await insforgeAdmin.database
    .from("services")
    .select("id, duration_minutes")
    .eq("organization_id", organizationId)
    .eq("id", serviceId)
    .eq("is_active", true)
    .maybeSingle();
  if (!service) throw new AppError(ErrorCodes.SERVICE_NOT_FOUND, "Ese servicio no está disponible.", 404);
  return service as { id: string; duration_minutes: number };
}

export async function getPublicAvailability(slug: string, serviceId: string, date: string, now = new Date()) {
  const org = await resolveOrganization(slug);
  await assertActiveService(org.id, serviceId);
  const { slots, reason, timezone } = await getAvailableSlots({ organizationId: org.id, date, serviceId, now });
  // Solo inicio/fin: qué recurso queda libre es un detalle interno del negocio.
  return { timezone, reason: slots.length === 0 ? reason ?? "No hay horarios disponibles ese día." : undefined, slots: slots.map((s) => ({ start: s.start, end: s.end })) };
}

/** Deja solo dígitos y un "+" inicial, para que el mismo teléfono escrito distinto sea el mismo cliente. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export interface PublicBookingInput {
  serviceId: string;
  start: string; // ISO, uno de los slots devueltos por getPublicAvailability
  date: string; // YYYY-MM-DD en la zona del negocio (la del slot)
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  /** Casilla de autorización de datos de salud (consultorios, clínicas, fisioterapia). */
  healthDataConsent?: boolean;
}

export async function createPublicReservation(slug: string, input: PublicBookingInput, now = new Date()) {
  const org = await resolveOrganization(slug);
  const service = await assertActiveService(org.id, input.serviceId);

  // Se vuelve a calcular la disponibilidad en el momento de reservar: el
  // horario que el visitante eligió puede haberse ocupado mientras llenaba
  // el formulario. Si ya no está en la lista, no se reserva.
  const { slots } = await getAvailableSlots({ organizationId: org.id, date: input.date, serviceId: service.id, now });
  const requestedStart = new Date(input.start).getTime();
  const slot = slots.find((s) => new Date(s.start).getTime() === requestedStart);
  if (!slot) {
    throw new AppError(ErrorCodes.RESERVATION_NOT_AVAILABLE, "Ese horario ya no está disponible. Elegí otro.", 409);
  }

  const customer = await findOrCreateCustomerByPhone(org.id, normalizePhone(input.phone), input.name.trim(), input.email?.trim() || undefined);
  const startAt = new Date(slot.start);

  // Datos de salud (Ley 1581): el motivo de consulta solo se guarda si el
  // paciente marcó la autorización (o ya la había dado antes).
  let notes = input.notes?.trim() || null;
  if (requiresHealthDataConsent(org.business_type)) {
    if (input.healthDataConsent && !customer.health_data_consent_at) {
      await insforgeAdmin.database
        .from("customers")
        .update({ health_data_consent_at: now.toISOString(), health_data_consent_source: "public_page" })
        .eq("id", customer.id);
    } else if (!input.healthDataConsent && !customer.health_data_consent_at) {
      notes = null;
    }
  }

  const reservation = await createReservation({
    organizationId: org.id,
    customerId: customer.id,
    serviceId: service.id,
    // El primer recurso libre del slot (si el negocio usa recursos); la
    // restricción EXCLUDE de la tabla sigue siendo la garantía final.
    resourceId: slot.availableResourceIds[0] ?? null,
    conversationId: null,
    startAt,
    endAt: addMinutes(startAt, service.duration_minutes),
    partySize: null,
    customerName: input.name.trim(),
    specialRequests: notes,
    source: "web"
  });

  return {
    id: reservation.id,
    start_at: reservation.start_at,
    end_at: reservation.end_at,
    timezone: org.timezone,
    // "Avisame por Telegram / WhatsApp": confirmación y recordatorio por chat.
    ...(await createReservationChatLink(org.id, reservation.id))
  };
}

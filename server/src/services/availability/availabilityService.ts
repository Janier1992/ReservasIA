import { addMinutes, isBefore } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import type { BusinessHourPeriod, BusinessProfile, Reservation, Resource, Service } from "../../types/domain.js";

export interface Slot {
  /** ISO 8601 en UTC */
  start: string;
  /** ISO 8601 en UTC */
  end: string;
  /** Recursos concretos libres para este slot (vacío si el negocio no usa recursos). */
  availableResourceIds: string[];
}

interface ResourceHourPeriod {
  resource_id: string;
  day_of_week: number;
  opening_time: string;
  closing_time: string;
}

interface ScheduleBlock {
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
}

interface AvailabilityContext {
  organizationId: string;
  businessProfile: BusinessProfile;
  periods: BusinessHourPeriod[];
  resources: Resource[];
  reservations: Reservation[];
  durationMinutes: number;
  resourceHours: ResourceHourPeriod[];
  blocks: ScheduleBlock[];
}

async function loadBusinessProfile(organizationId: string): Promise<BusinessProfile> {
  const { data, error } = await insforgeAdmin.database
    .from("business_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo cargar el perfil del negocio.", 500);
  if (!data) throw new AppError(ErrorCodes.ORGANIZATION_NOT_FOUND, "El negocio no tiene perfil configurado.", 404);
  return data as BusinessProfile;
}

async function loadPeriodsForDay(organizationId: string, dayOfWeek: number): Promise<BusinessHourPeriod[]> {
  const { data, error } = await insforgeAdmin.database
    .from("business_hour_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("day_of_week", dayOfWeek)
    .order("opening_time", { ascending: true });

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo cargar el horario del negocio.", 500);
  return (data ?? []) as BusinessHourPeriod[];
}

async function loadActiveResources(organizationId: string, resourceId?: string): Promise<Resource[]> {
  let query = insforgeAdmin.database.from("resources").select("*").eq("organization_id", organizationId).eq("is_active", true);
  if (resourceId) query = query.eq("id", resourceId);
  const { data, error } = await query;
  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudieron cargar los recursos.", 500);
  return (data ?? []) as Resource[];
}

async function loadActiveReservationsForDay(
  organizationId: string,
  dayStartUtc: Date,
  dayEndUtc: Date
): Promise<Reservation[]> {
  const { data, error } = await insforgeAdmin.database
    .from("reservations")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "confirmed"])
    .lt("start_at", dayEndUtc.toISOString())
    .gt("end_at", dayStartUtc.toISOString());

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudieron cargar las reservas existentes.", 500);
  return (data ?? []) as Reservation[];
}

/**
 * Horario propio de los recursos (todos los días: un recurso con horario
 * propio que no tiene filas un día, ese día no trabaja). Si la consulta
 * falla se sigue con el horario del negocio: el horario por recurso es una
 * preferencia, no una garantía (esa la dan los bloqueos en la base).
 */
async function loadResourceHours(organizationId: string): Promise<ResourceHourPeriod[]> {
  const { data, error } = await insforgeAdmin.database
    .from("resource_hour_periods")
    .select("resource_id, day_of_week, opening_time, closing_time")
    .eq("organization_id", organizationId);
  if (error) {
    logger.warn({ organizationId, err: error }, "No se pudo cargar el horario por recurso; se usa el del negocio");
    return [];
  }
  return (data ?? []) as ResourceHourPeriod[];
}

/** Bloqueos que tocan el día. Si fallan, la base igual rechaza la reserva (TIME_BLOCKED). */
async function loadBlocksForDay(organizationId: string, dayStartUtc: Date, dayEndUtc: Date): Promise<ScheduleBlock[]> {
  const { data, error } = await insforgeAdmin.database
    .from("schedule_blocks")
    .select("resource_id, starts_at, ends_at")
    .eq("organization_id", organizationId)
    .lt("starts_at", dayEndUtc.toISOString())
    .gt("ends_at", dayStartUtc.toISOString());
  if (error) {
    logger.warn({ organizationId, err: error }, "No se pudieron cargar los bloqueos de agenda");
    return [];
  }
  return (data ?? []) as ScheduleBlock[];
}

async function resolveServiceDuration(organizationId: string, serviceId?: string, fallback = 60): Promise<number> {
  if (!serviceId) return fallback;
  const { data, error } = await insforgeAdmin.database
    .from("services")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", serviceId)
    .maybeSingle();

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo cargar el servicio.", 500);
  if (!data) throw new AppError(ErrorCodes.SERVICE_NOT_FOUND, "El servicio indicado no existe.", 404);
  const service = data as Service;
  if (!service.is_active) throw new AppError(ErrorCodes.SERVICE_NOT_FOUND, "El servicio indicado no está activo.", 404);
  return service.duration_minutes;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * day_of_week con la convención de JS Date.getDay() (0=domingo..6=sábado),
 * calculado de forma robusta con Intl para un instante UTC en un timezone
 * arbitrario. IMPORTANTE: no usar `toZonedTime(...).getDay()` — esa
 * combinación sólo da el resultado correcto si el proceso corre con
 * TZ=UTC, porque toZonedTime codifica la hora local en los campos UTC del
 * Date, y los getters locales (getDay/getHours) vuelven a reinterpretarlos
 * según el timezone del sistema operativo.
 */
function dayOfWeekInTimeZone(atUtc: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(atUtc);
  return WEEKDAY_INDEX[weekday];
}

export async function isBusinessOpen(organizationId: string, atUtc: Date): Promise<boolean> {
  const businessProfile = await loadBusinessProfile(organizationId);
  const periods = await loadPeriodsForDay(organizationId, dayOfWeekInTimeZone(atUtc, businessProfile.timezone));

  const timeOfDay = formatInTimeZone(atUtc, businessProfile.timezone, "HH:mm:ss");
  return periods.some(
    (p) => !p.is_closed && p.opening_time && p.closing_time && timeOfDay >= p.opening_time && timeOfDay < p.closing_time
  );
}

export function validateReservationWindow(businessProfile: BusinessProfile, startAtUtc: Date, nowUtc: Date): void {
  if (isBefore(startAtUtc, nowUtc)) {
    throw new AppError(ErrorCodes.RESERVATION_IN_PAST, "No se puede reservar en el pasado.", 422);
  }

  const minAllowed = addMinutes(nowUtc, businessProfile.advance_booking_hours * 60);
  if (isBefore(startAtUtc, minAllowed)) {
    throw new AppError(
      ErrorCodes.OUTSIDE_BOOKING_WINDOW,
      `Se requiere reservar con al menos ${businessProfile.advance_booking_hours} hora(s) de anticipación.`,
      422
    );
  }

  const maxAllowed = addMinutes(nowUtc, businessProfile.max_booking_days * 24 * 60);
  if (isBefore(maxAllowed, startAtUtc)) {
    throw new AppError(
      ErrorCodes.OUTSIDE_BOOKING_WINDOW,
      `Sólo se pueden hacer reservas hasta ${businessProfile.max_booking_days} día(s) hacia adelante.`,
      422
    );
  }
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return isBefore(aStart, bEnd) && isBefore(bStart, aEnd);
}

function isResourceFree(resourceId: string, start: Date, end: Date, reservations: Reservation[]): boolean {
  return !reservations.some(
    (r) => r.resource_id === resourceId && overlaps(start, end, new Date(r.start_at), new Date(r.end_at))
  );
}

function isBlocked(resourceId: string | null, start: Date, end: Date, blocks: ScheduleBlock[]): boolean {
  return blocks.some(
    (b) => (b.resource_id === null || b.resource_id === resourceId) && overlaps(start, end, new Date(b.starts_at), new Date(b.ends_at))
  );
}

/** true si el recurso trabaja en todo el slot (sin horario propio = sigue el del negocio). */
function isWithinResourceHours(
  resourceId: string,
  start: Date,
  end: Date,
  date: string,
  dayOfWeek: number,
  timezone: string,
  resourceHours: ResourceHourPeriod[]
): boolean {
  const own = resourceHours.filter((h) => h.resource_id === resourceId);
  if (own.length === 0) return true;
  return own.some((h) => {
    if (h.day_of_week !== dayOfWeek) return false;
    const opens = fromZonedTime(`${date}T${h.opening_time}`, timezone);
    const closes = fromZonedTime(`${date}T${h.closing_time}`, timezone);
    return !isBefore(start, opens) && !isBefore(closes, end);
  });
}

function capacityUsedAt(start: Date, end: Date, reservations: Reservation[]): number {
  return reservations
    .filter((r) => r.resource_id === null && overlaps(start, end, new Date(r.start_at), new Date(r.end_at)))
    .reduce((sum, r) => sum + (r.party_size ?? 1), 0);
}

async function buildContext(organizationId: string, dateYmd: string, serviceId?: string, resourceId?: string) {
  const businessProfile = await loadBusinessProfile(organizationId);
  const durationMinutes = await resolveServiceDuration(
    organizationId,
    serviceId,
    businessProfile.reservation_duration_minutes
  );

  const zonedMidnight = fromZonedTime(`${dateYmd}T00:00:00`, businessProfile.timezone);
  const dayOfWeek = dayOfWeekInTimeZone(zonedMidnight, businessProfile.timezone);

  const periods = await loadPeriodsForDay(organizationId, dayOfWeek);
  const resources = await loadActiveResources(organizationId, resourceId);

  const dayEndUtc = fromZonedTime(`${dateYmd}T23:59:59`, businessProfile.timezone);
  const reservations = await loadActiveReservationsForDay(organizationId, zonedMidnight, dayEndUtc);
  const resourceHours = resources.length > 0 ? await loadResourceHours(organizationId) : [];
  const blocks = await loadBlocksForDay(organizationId, zonedMidnight, dayEndUtc);

  const context: AvailabilityContext = {
    organizationId,
    businessProfile,
    periods,
    resources,
    reservations,
    durationMinutes,
    resourceHours,
    blocks
  };
  return context;
}

/**
 * Motor de disponibilidad genérico. No asume ningún tipo de negocio
 * particular: usa `resources` cuando el negocio los define (mesas,
 * barberos, consultorios) o `capacity_total` cuando no (agenda simple).
 */
export async function getAvailableSlots(params: {
  organizationId: string;
  date: string; // YYYY-MM-DD, interpretado en el timezone del negocio
  serviceId?: string;
  resourceId?: string;
  partySize?: number;
  now?: Date;
}): Promise<{ slots: Slot[]; reason?: string; timezone: string }> {
  const now = params.now ?? new Date();
  const ctx = await buildContext(params.organizationId, params.date, params.serviceId, params.resourceId);
  const { businessProfile, periods, resources, reservations, durationMinutes, resourceHours, blocks } = ctx;
  const dayOfWeek = dayOfWeekInTimeZone(fromZonedTime(`${params.date}T12:00:00`, businessProfile.timezone), businessProfile.timezone);

  const openPeriods = periods.filter((p) => !p.is_closed && p.opening_time && p.closing_time);
  if (openPeriods.length === 0) {
    return { slots: [], reason: "El negocio está cerrado ese día.", timezone: businessProfile.timezone };
  }

  const usesResources = resources.length > 0;
  const partySize = params.partySize ?? 1;
  const capacity = businessProfile.capacity_total ?? (usesResources ? null : 1);

  const slots: Slot[] = [];

  for (const period of openPeriods) {
    let cursor = fromZonedTime(`${params.date}T${period.opening_time}`, businessProfile.timezone);
    const periodEnd = fromZonedTime(`${params.date}T${period.closing_time}`, businessProfile.timezone);

    while (isBefore(addMinutes(cursor, durationMinutes), addMinutes(periodEnd, 1))) {
      const slotStart = cursor;
      const slotEnd = addMinutes(cursor, durationMinutes);

      try {
        validateReservationWindow(businessProfile, slotStart, now);

        if (isBlocked(null, slotStart, slotEnd, blocks.filter((b) => b.resource_id === null))) {
          // Todo el negocio bloqueado (festivo, cierre): no hay slot.
        } else if (usesResources) {
          const free = resources
            .filter(
              (r) =>
                isResourceFree(r.id, slotStart, slotEnd, reservations) &&
                !isBlocked(r.id, slotStart, slotEnd, blocks) &&
                isWithinResourceHours(r.id, slotStart, slotEnd, params.date, dayOfWeek, businessProfile.timezone, resourceHours)
            )
            .map((r) => r.id);
          if (free.length > 0) {
            slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), availableResourceIds: free });
          }
        } else {
          const used = capacityUsedAt(slotStart, slotEnd, reservations);
          if (capacity === null || used + partySize <= capacity) {
            slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), availableResourceIds: [] });
          }
        }
      } catch {
        // Fuera de la ventana de reserva (pasado / demasiado lejos) -> se omite el slot.
      }

      cursor = addMinutes(cursor, businessProfile.slot_interval_minutes);
    }
  }

  return { slots, timezone: businessProfile.timezone };
}

export async function checkResourceAvailability(
  organizationId: string,
  resourceId: string,
  startAtUtc: Date,
  endAtUtc: Date,
  excludeReservationId?: string
): Promise<boolean> {
  const { data, error } = await insforgeAdmin.database
    .from("reservations")
    .select("id, start_at, end_at, resource_id")
    .eq("organization_id", organizationId)
    .eq("resource_id", resourceId)
    .in("status", ["pending", "confirmed"])
    .lt("start_at", endAtUtc.toISOString())
    .gt("end_at", startAtUtc.toISOString());

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo validar la disponibilidad del recurso.", 500);
  const conflicts = (data ?? []).filter((r) => r.id !== excludeReservationId);
  return conflicts.length === 0;
}

export async function checkCapacity(
  organizationId: string,
  startAtUtc: Date,
  endAtUtc: Date,
  partySize: number,
  excludeReservationId?: string
): Promise<boolean> {
  const businessProfile = await loadBusinessProfile(organizationId);
  if (businessProfile.capacity_total === null) return true;

  const { data, error } = await insforgeAdmin.database
    .from("reservations")
    .select("id, start_at, end_at, party_size, resource_id")
    .eq("organization_id", organizationId)
    .is("resource_id", null)
    .in("status", ["pending", "confirmed"])
    .lt("start_at", endAtUtc.toISOString())
    .gt("end_at", startAtUtc.toISOString());

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo validar la capacidad del negocio.", 500);
  const used = (data ?? [])
    .filter((r) => r.id !== excludeReservationId)
    .reduce((sum, r) => sum + (r.party_size ?? 1), 0);

  return used + partySize <= businessProfile.capacity_total;
}

export { loadBusinessProfile };

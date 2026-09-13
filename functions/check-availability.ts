// Edge Function: check-availability
// Invocada desde el dashboard para calcular disponibilidad real, usando el
// mismo algoritmo que el motor de disponibilidad del compute service
// (server/src/services/availability/availabilityService.ts). Es una
// copia deliberada (no una única fuente de verdad en SQL): ver la nota en
// el PRP sobre esta deuda técnica.
import { createClient } from "npm:@insforge/sdk";
import { addMinutes, isBefore } from "npm:date-fns";
import { fromZonedTime } from "npm:date-fns-tz";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function dayOfWeekInTimeZone(atUtc: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(atUtc);
  return WEEKDAY_INDEX[weekday];
}

interface Reservation {
  id: string;
  resource_id: string | null;
  start_at: string;
  end_at: string;
  party_size: number | null;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return isBefore(aStart, bEnd) && isBefore(bStart, aEnd);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const authHeader = req.headers.get("Authorization");
  const userToken = authHeader?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const client = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await client.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id");
  const date = url.searchParams.get("date");
  const serviceId = url.searchParams.get("service_id") ?? undefined;
  const resourceId = url.searchParams.get("resource_id") ?? undefined;
  const partySize = url.searchParams.get("party_size") ? Number(url.searchParams.get("party_size")) : undefined;

  if (!organizationId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "organization_id y date (YYYY-MM-DD) son requeridos." } }, 400);
  }

  const { data: membership } = await client.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership) return jsonResponse({ error: { code: "NOT_A_MEMBER" } }, 403);

  const { data: businessProfile } = await client.database
    .from("business_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!businessProfile) return jsonResponse({ error: { code: "ORGANIZATION_NOT_FOUND" } }, 404);

  let durationMinutes = businessProfile.reservation_duration_minutes;
  if (serviceId) {
    const { data: service } = await client.database
      .from("services")
      .select("duration_minutes, is_active")
      .eq("organization_id", organizationId)
      .eq("id", serviceId)
      .maybeSingle();
    if (!service || !service.is_active) return jsonResponse({ error: { code: "SERVICE_NOT_FOUND" } }, 404);
    durationMinutes = service.duration_minutes;
  }

  const zonedMidnight = fromZonedTime(`${date}T00:00:00`, businessProfile.timezone);
  const dayOfWeek = dayOfWeekInTimeZone(zonedMidnight, businessProfile.timezone);

  let periodsQuery = client.database
    .from("business_hour_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_closed", false);
  const { data: periods } = await periodsQuery;

  const openPeriods = (periods ?? []).filter((p: { opening_time: string | null; closing_time: string | null }) => p.opening_time && p.closing_time);
  if (openPeriods.length === 0) {
    return jsonResponse({ slots: [], reason: "El negocio está cerrado ese día.", timezone: businessProfile.timezone }, 200);
  }

  let resourcesQuery = client.database.from("resources").select("*").eq("organization_id", organizationId).eq("is_active", true);
  if (resourceId) resourcesQuery = resourcesQuery.eq("id", resourceId);
  const { data: resources } = await resourcesQuery;

  const dayEndUtc = fromZonedTime(`${date}T23:59:59`, businessProfile.timezone);
  const { data: reservations } = await client.database
    .from("reservations")
    .select("id, resource_id, start_at, end_at, party_size, status")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "confirmed"])
    .lt("start_at", dayEndUtc.toISOString())
    .gt("end_at", zonedMidnight.toISOString());

  const activeReservations: Reservation[] = reservations ?? [];
  const usesResources = (resources ?? []).length > 0;
  const requestedPartySize = partySize ?? 1;
  const capacity = businessProfile.capacity_total ?? (usesResources ? null : 1);
  const now = new Date();

  const slots: { start: string; end: string; availableResourceIds: string[] }[] = [];

  for (const period of openPeriods) {
    let cursor = fromZonedTime(`${date}T${period.opening_time}`, businessProfile.timezone);
    const periodEnd = fromZonedTime(`${date}T${period.closing_time}`, businessProfile.timezone);

    while (isBefore(addMinutes(cursor, durationMinutes), addMinutes(periodEnd, 1))) {
      const slotStart = cursor;
      const slotEnd = addMinutes(cursor, durationMinutes);

      const minAllowed = addMinutes(now, businessProfile.advance_booking_hours * 60);
      const maxAllowed = addMinutes(now, businessProfile.max_booking_days * 24 * 60);

      if (!isBefore(slotStart, now) && !isBefore(slotStart, minAllowed) && !isBefore(maxAllowed, slotStart)) {
        if (usesResources) {
          const free = (resources ?? [])
            .filter(
              (r: { id: string }) =>
                !activeReservations.some(
                  (res) => res.resource_id === r.id && overlaps(slotStart, slotEnd, new Date(res.start_at), new Date(res.end_at))
                )
            )
            .map((r: { id: string }) => r.id);
          if (free.length > 0) {
            slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), availableResourceIds: free });
          }
        } else {
          const used = activeReservations
            .filter((res) => res.resource_id === null && overlaps(slotStart, slotEnd, new Date(res.start_at), new Date(res.end_at)))
            .reduce((sum, res) => sum + (res.party_size ?? 1), 0);
          if (capacity === null || used + requestedPartySize <= capacity) {
            slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), availableResourceIds: [] });
          }
        }
      }

      cursor = addMinutes(cursor, businessProfile.slot_interval_minutes);
    }
  }

  return jsonResponse({ slots, timezone: businessProfile.timezone }, 200);
}

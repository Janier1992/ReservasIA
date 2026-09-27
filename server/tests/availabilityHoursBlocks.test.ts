import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return createInsforgeMock({
      business_profiles: {
        data: {
          organization_id: "org-1",
          timezone: "America/Bogota",
          capacity_total: null,
          reservation_duration_minutes: 60,
          slot_interval_minutes: 60,
          advance_booking_hours: 0,
          max_booking_days: 60
        },
        error: null
      },
      business_hour_periods: {
        data: [{ organization_id: "org-1", day_of_week: 1, is_closed: false, opening_time: "09:00:00", closing_time: "12:00:00" }],
        error: null
      },
      resources: {
        data: [
          { id: "juan", organization_id: "org-1", name: "Juan", is_active: true },
          { id: "pedro", organization_id: "org-1", name: "Pedro", is_active: true }
        ],
        error: null
      },
      reservations: { data: [], error: null },
      // Juan solo trabaja los lunes de 9 a 10.
      resource_hour_periods: { data: [{ resource_id: "juan", day_of_week: 1, opening_time: "09:00:00", closing_time: "10:00:00" }], error: null },
      schedule_blocks: {
        data: [
          // Almuerzo de Pedro 10-11 (Bogotá = UTC-5) y cierre de todo el negocio 11-12.
          { resource_id: "pedro", starts_at: "2026-09-07T15:00:00Z", ends_at: "2026-09-07T16:00:00Z" },
          { resource_id: null, starts_at: "2026-09-07T16:00:00Z", ends_at: "2026-09-07T17:00:00Z" }
        ],
        error: null
      }
    });
  }
}));

const { getAvailableSlots } = await import("../src/services/availability/availabilityService.js");

describe("availability with resource hours and schedule blocks", () => {
  it("respects each resource's own hours, resource blocks and business-wide blocks", async () => {
    const { slots } = await getAvailableSlots({ organizationId: "org-1", date: "2026-09-07", now: new Date("2026-09-06T00:00:00Z") });
    expect(slots.map((s) => [s.start.slice(11, 16), s.availableResourceIds])).toEqual([["14:00", ["juan", "pedro"]]]);
  });
});

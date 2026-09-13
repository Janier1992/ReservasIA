import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

const businessProfile = {
  organization_id: "org-1",
  timezone: "America/Bogota",
  capacity_total: 2,
  reservation_duration_minutes: 60,
  slot_interval_minutes: 60,
  advance_booking_hours: 1,
  max_booking_days: 60
};

let reservationsResponse: { data: unknown[]; error: null } = { data: [], error: null };

vi.mock("../src/lib/insforge.js", () => {
  return {
    get insforgeAdmin() {
      return createInsforgeMock({
        business_profiles: { data: businessProfile, error: null },
        business_hour_periods: {
          data: [{ organization_id: "org-1", day_of_week: 1, is_closed: false, opening_time: "09:00:00", closing_time: "11:00:00" }],
          error: null
        },
        resources: { data: [], error: null },
        reservations: () => reservationsResponse
      });
    }
  };
});

const { getAvailableSlots, validateReservationWindow } = await import("../src/services/availability/availabilityService.js");

describe("availabilityService.getAvailableSlots", () => {
  beforeEach(() => {
    reservationsResponse = { data: [], error: null };
  });

  it("returns available slots inside business hours when there is capacity", async () => {
    const result = await getAvailableSlots({
      organizationId: "org-1",
      date: "2026-09-07", // Monday
      now: new Date("2026-09-06T00:00:00Z")
    });

    expect(result.slots.map((s) => s.start.slice(11, 16))).toEqual(["14:00", "15:00"]);
  });

  it("excludes slots where capacity would be exceeded", async () => {
    reservationsResponse = {
      data: [
        {
          id: "res-1",
          organization_id: "org-1",
          resource_id: null,
          start_at: "2026-09-07T14:00:00.000Z",
          end_at: "2026-09-07T15:00:00.000Z",
          party_size: 2,
          status: "confirmed"
        }
      ],
      error: null
    };

    const result = await getAvailableSlots({
      organizationId: "org-1",
      date: "2026-09-07",
      now: new Date("2026-09-06T00:00:00Z")
    });

    expect(result.slots.map((s) => s.start.slice(11, 16))).toEqual(["15:00"]);
  });
});

describe("availabilityService.validateReservationWindow", () => {
  it("rejects reservations in the past", () => {
    expect(() =>
      validateReservationWindow(businessProfile as never, new Date("2020-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))
    ).toThrow(/pasado/i);
  });

  it("rejects reservations before the minimum advance window", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(() => validateReservationWindow(businessProfile as never, new Date("2026-01-01T10:30:00Z"), now)).toThrow(
      /anticipación/i
    );
  });

  it("rejects reservations beyond the maximum booking window", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(() => validateReservationWindow(businessProfile as never, new Date("2027-01-01T10:00:00Z"), now)).toThrow(
      /hacia adelante/i
    );
  });

  it("accepts a valid reservation window", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(() => validateReservationWindow(businessProfile as never, new Date("2026-01-02T10:00:00Z"), now)).not.toThrow();
  });
});

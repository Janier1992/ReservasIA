import { describe, expect, it } from "vitest";
import { RESERVATION_STATUS_LABEL, reservationStatusLabel, reservationStatusVariant } from "@/lib/reservationStatus";
import type { ReservationStatus } from "@/types/domain";

const ALL_STATUSES: ReservationStatus[] = ["pending", "confirmed", "cancelled", "completed", "no_show"];

describe("reservationStatusLabel", () => {
  it("translates every known status to a Spanish label", () => {
    for (const status of ALL_STATUSES) {
      expect(reservationStatusLabel(status)).toBe(RESERVATION_STATUS_LABEL[status]);
    }
  });

  it("falls back to the raw value for an unknown status instead of throwing", () => {
    expect(reservationStatusLabel("some_future_status")).toBe("some_future_status");
  });
});

describe("reservationStatusVariant", () => {
  it("gives every known status a badge variant", () => {
    for (const status of ALL_STATUSES) {
      expect(typeof reservationStatusVariant(status)).toBe("string");
    }
  });

  it("falls back to muted for an unknown status", () => {
    expect(reservationStatusVariant("some_future_status")).toBe("muted");
  });
});

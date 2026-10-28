import { describe, expect, it } from "vitest";
import { RESERVATION_STATUS_LABEL, reservationStatusLabel, reservationStatusVariant } from "@/lib/reservationStatus";
import type { ReservationStatus } from "@/types/domain";

const ALL_STATUSES: ReservationStatus[] = ["pending", "confirmed", "cancelled", "completed", "no_show"];

describe("reservationStatusLabel", () => {
  it("traduce cada estado conocido a una etiqueta en español", () => {
    for (const status of ALL_STATUSES) {
      expect(reservationStatusLabel(status)).toBe(RESERVATION_STATUS_LABEL[status]);
    }
  });

  it("usa el valor tal cual para un estado desconocido en vez de fallar", () => {
    expect(reservationStatusLabel("some_future_status")).toBe("some_future_status");
  });
});

describe("reservationStatusVariant", () => {
  it("le da a cada estado conocido un estilo de etiqueta", () => {
    for (const status of ALL_STATUSES) {
      expect(typeof reservationStatusVariant(status)).toBe("string");
    }
  });

  it("usa el estilo apagado para un estado desconocido", () => {
    expect(reservationStatusVariant("some_future_status")).toBe("muted");
  });
});

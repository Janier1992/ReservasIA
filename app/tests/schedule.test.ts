import { describe, expect, it } from "vitest";
import { blockRange, bookingErrorMessage, formatBlockRange, overlappingReservations, summarizeHourPeriods, validateHourPeriods } from "@/lib/schedule";

describe("blockRange", () => {
  it("convierte un bloqueo de parte del día en la zona horaria del negocio", () => {
    expect(
      blockRange({ startDate: "2026-10-05", endDate: "2026-10-05", allDay: false, startTime: "12:00", endTime: "13:00" }, "America/Bogota")
    ).toEqual({ starts_at: "2026-10-05T17:00:00.000Z", ends_at: "2026-10-05T18:00:00.000Z" });
  });

  it("cubre días completos hasta la medianoche posterior al último día", () => {
    expect(
      blockRange({ startDate: "2026-10-05", endDate: "2026-10-09", allDay: true, startTime: "", endTime: "" }, "America/Bogota")
    ).toEqual({ starts_at: "2026-10-05T05:00:00.000Z", ends_at: "2026-10-10T05:00:00.000Z" });
  });

  it("rechaza un fin anterior al inicio", () => {
    expect(blockRange({ startDate: "2026-10-05", endDate: "2026-10-05", allDay: false, startTime: "13:00", endTime: "12:00" }, "UTC")).toBeNull();
  });
});

describe("formatBlockRange", () => {
  it("describe bloqueos de días completos y de un mismo día", () => {
    expect(formatBlockRange("2026-10-05T05:00:00Z", "2026-10-10T05:00:00Z", "America/Bogota")).toBe("lun, 5 de oct – vie, 9 de oct (todo el día)");
    expect(formatBlockRange("2026-10-05T17:00:00Z", "2026-10-05T18:00:00Z", "America/Bogota")).toBe("lun, 5 de oct, 12:00 – 13:00");
  });
});

describe("overlappingReservations", () => {
  const r = (start_at: string, end_at: string, resource_id: string | null, status = "confirmed") => ({ start_at, end_at, resource_id, status });
  it("cuenta las reservas activas del recurso bloqueado (o todas, en un bloqueo de todo el negocio)", () => {
    const list = [
      r("2026-10-05T17:30:00Z", "2026-10-05T18:30:00Z", "juan"),
      r("2026-10-05T17:30:00Z", "2026-10-05T18:30:00Z", "pedro"),
      r("2026-10-05T18:00:00Z", "2026-10-05T19:00:00Z", "juan"),
      r("2026-10-05T17:00:00Z", "2026-10-05T18:00:00Z", "juan", "cancelled")
    ];
    const block = { starts_at: "2026-10-05T17:00:00Z", ends_at: "2026-10-05T18:00:00Z" };
    expect(overlappingReservations(list, { ...block, resource_id: "juan" })).toHaveLength(1);
    expect(overlappingReservations(list, { ...block, resource_id: null })).toHaveLength(2);
  });
});

describe("hour periods", () => {
  it("detecta franjas invertidas y solapadas", () => {
    expect(validateHourPeriods([{ day_of_week: 1, opening_time: "09:00", closing_time: "13:00" }, { day_of_week: 1, opening_time: "14:00", closing_time: "18:00" }])).toBeNull();
    expect(validateHourPeriods([{ day_of_week: 2, opening_time: "10:00", closing_time: "09:00" }])).toMatch(/Martes/);
    expect(validateHourPeriods([{ day_of_week: 3, opening_time: "09:00", closing_time: "13:00" }, { day_of_week: 3, opening_time: "12:00", closing_time: "15:00" }])).toMatch(/pisan/);
  });

  it("resume los días de atención empezando por el lunes", () => {
    expect(summarizeHourPeriods([])).toBe("Horario del negocio");
    expect(summarizeHourPeriods([{ day_of_week: 0 }, { day_of_week: 1 }, { day_of_week: 3 }])).toBe("Lun, Mié, Dom");
  });
});

describe("bookingErrorMessage", () => {
  it("explica los horarios bloqueados y ocupados", () => {
    expect(bookingErrorMessage({ message: "TIME_BLOCKED" })).toMatch(/bloqueado/);
    expect(bookingErrorMessage(new Error("RESERVATION_NOT_AVAILABLE"))).toMatch(/ocupado/);
    expect(bookingErrorMessage(new Error("otra cosa"))).toBe("otra cosa");
  });
});

describe("weeklyDates", () => {
  it("devuelve una fecha por semana, pasando de mes y de año", async () => {
    const { weeklyDates } = await import("@/lib/schedule");
    expect(weeklyDates("2026-12-21", 3)).toEqual(["2026-12-21", "2026-12-28", "2027-01-04"]);
    expect(weeklyDates("2026-10-05", 1)).toEqual(["2026-10-05"]);
  });
});

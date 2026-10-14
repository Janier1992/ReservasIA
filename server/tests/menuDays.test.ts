import { describe, expect, it } from "vitest";
import { isOnMenu, isSoldOut, localDateIn, weekdayIn } from "../src/services/publicBooking/menuDays.js";

describe("menu of the day", () => {
  it("uses the business timezone to decide which day it is", () => {
    // Sábado 10 de octubre de 2026, 11:30 p. m. en Bogotá = domingo 04:30 UTC.
    const lateSaturday = new Date("2026-10-11T04:30:00Z");
    expect(weekdayIn("America/Bogota", lateSaturday)).toBe(6);
    expect(weekdayIn("UTC", lateSaturday)).toBe(0);
  });

  it("offers products without days every day, and the others only on their days", () => {
    expect(isOnMenu(null, 3)).toBe(true);
    expect(isOnMenu([], 3)).toBe(true);
    expect(isOnMenu([1, 4], 4)).toBe(true);
    expect(isOnMenu([1, 4], 5)).toBe(false);
  });

  it("treats a product as sold out only on the local day it was marked", () => {
    // 11:30 p. m. del sábado en Bogotá: todavía es el 10 de octubre allá.
    const today = localDateIn("America/Bogota", new Date("2026-10-11T04:30:00Z"));
    expect(today).toBe("2026-10-10");
    expect(isSoldOut("2026-10-10", today)).toBe(true);
    expect(isSoldOut("2026-10-09", today)).toBe(false);
    expect(isSoldOut(null, today)).toBe(false);
  });
});

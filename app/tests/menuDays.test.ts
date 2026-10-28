import { describe, expect, it } from "vitest";
import { describeMenuDays, isOnMenu, isSoldOut, localDateIn, toggleMenuDay, weekdayIn } from "@/lib/menuDays";

describe("menú del día", () => {
  it("usa la zona horaria del negocio para saber qué día es", () => {
    // Sábado 10 de octubre de 2026, 11:30 p. m. en Bogotá = domingo 04:30 UTC.
    const lateSaturday = new Date("2026-10-11T04:30:00Z");
    expect(weekdayIn("America/Bogota", lateSaturday)).toBe(6);
    expect(weekdayIn("UTC", lateSaturday)).toBe(0);
  });

  it("offers products without days every day", () => {
    expect(isOnMenu(null, 3)).toBe(true);
    expect(isOnMenu([1, 4], 4)).toBe(true);
    expect(isOnMenu([1, 4], 5)).toBe(false);
  });

  it("toggles days, treating all seven as 'every day'", () => {
    expect(toggleMenuDay(null, 0)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(toggleMenuDay([1, 2, 3, 4, 5, 6], 0)).toBeNull();
    expect(toggleMenuDay([1, 4], 4)).toEqual([1]);
    expect(toggleMenuDay([1], 1)).toEqual([1]);
    expect(toggleMenuDay([4], 1)).toEqual([1, 4]);
  });

  it("describe los días en español, empezando por el lunes", () => {
    expect(describeMenuDays(null)).toBe("Todos los días");
    expect(describeMenuDays([4, 1, 0])).toBe("lun, jue, dom");
  });

  it("marca un producto como agotado solo el día local en que se marcó", () => {
    // 11:30 p. m. del sábado en Bogotá: todavía es el 10 de octubre allá.
    const today = localDateIn("America/Bogota", new Date("2026-10-11T04:30:00Z"));
    expect(today).toBe("2026-10-10");
    expect(isSoldOut("2026-10-10", today)).toBe(true);
    expect(isSoldOut("2026-10-09", today)).toBe(false);
    expect(isSoldOut(null, today)).toBe(false);
  });
});

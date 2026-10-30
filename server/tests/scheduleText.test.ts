import { describe, expect, it } from "vitest";
import { formatClock, formatNow, formatResourceHours, formatUpcomingDays, formatWeeklyHours } from "../src/services/agent/scheduleText.js";

/**
 * Horarios en las instrucciones del agente: el modelo no tiene que deducir
 * días de la semana ni horarios. Los dos primeros casos reproducen errores
 * reales del agente en negocios de prueba.
 */

const TZ = "America/Bogota";
const period = (day: number, open: string, close: string) =>
  ({ id: `p-${day}-${open}`, organization_id: "org-1", day_of_week: day, opening_time: `${open}:00`, closing_time: `${close}:00`, is_closed: false }) as never;

// Jueves 29 de octubre de 2026, 8:30 p. m. en Bogotá.
const THURSDAY_NIGHT = new Date("2026-10-30T01:30:00.000Z");

describe("horarios para el agente", () => {
  it("restaurante de lunes a sábado: un jueves de noche, mañana viernes está abierto y el domingo cerrado", () => {
    const monToSat = [1, 2, 3, 4, 5, 6].map((d) => period(d, "11:00", "21:00"));
    const calendar = formatUpcomingDays(THURSDAY_NIGHT, TZ, monToSat, []);
    expect(calendar.split("\n")).toEqual([
      "- Hoy, jueves 29 de octubre (2026-10-29): abierto de 11:00 a. m. a 9:00 p. m.",
      "- Mañana, viernes 30 de octubre (2026-10-30): abierto de 11:00 a. m. a 9:00 p. m.",
      "- Sábado 31 de octubre (2026-10-31): abierto de 11:00 a. m. a 9:00 p. m.",
      "- Domingo 1 de noviembre (2026-11-01): cerrado",
      "- Lunes 2 de noviembre (2026-11-02): abierto de 11:00 a. m. a 9:00 p. m.",
      "- Martes 3 de noviembre (2026-11-03): abierto de 11:00 a. m. a 9:00 p. m.",
      "- Miércoles 4 de noviembre (2026-11-04): abierto de 11:00 a. m. a 9:00 p. m."
    ]);
  });

  it("manicure solo sábados y domingos de día: la semana dice cerrado de lunes a viernes y el horario es diurno", () => {
    const weekend = [period(6, "09:00", "17:00"), period(0, "09:00", "17:00")];
    expect(formatWeeklyHours(weekend).split("\n")).toEqual([
      "- Lunes: cerrado",
      "- Martes: cerrado",
      "- Miércoles: cerrado",
      "- Jueves: cerrado",
      "- Viernes: cerrado",
      "- Sábado: de 9:00 a. m. a 5:00 p. m.",
      "- Domingo: de 9:00 a. m. a 5:00 p. m."
    ]);
  });

  it("varias franjas en un día salen ordenadas, aunque se hayan cargado al revés", () => {
    expect(formatWeeklyHours([period(1, "14:00", "19:00"), period(1, "08:00", "12:00")])).toContain(
      "- Lunes: de 8:00 a. m. a 12:00 m. y de 2:00 p. m. a 7:00 p. m."
    );
  });

  it("escribe las horas como en Colombia", () => {
    expect(formatClock("09:00:00")).toBe("9:00 a. m.");
    expect(formatClock("12:00")).toBe("12:00 m.");
    expect(formatClock("12:30")).toBe("12:30 p. m.");
    expect(formatClock("18:45")).toBe("6:45 p. m.");
    expect(formatClock("00:30")).toBe("12:30 a. m.");
  });

  it("da la fecha de hoy en español y en la zona del negocio, aunque en UTC ya sea otro día", () => {
    expect(formatNow(THURSDAY_NIGHT, TZ)).toBe("jueves 29 de octubre de 2026, 8:30 p. m.");
  });

  it("un festivo de todo el negocio deja el día cerrado y un bloqueo parcial se menciona", () => {
    const monToSat = [1, 2, 3, 4, 5, 6].map((d) => period(d, "09:00", "18:00"));
    const blocks = [
      { resource_id: null, starts_at: "2026-10-30T05:00:00.000Z", ends_at: "2026-10-31T05:00:00.000Z", reason: "Festivo" },
      { resource_id: null, starts_at: "2026-10-31T17:00:00.000Z", ends_at: "2026-10-31T19:00:00.000Z", reason: "Almuerzo" },
      { resource_id: "res-1", starts_at: "2026-11-02T05:00:00.000Z", ends_at: "2026-11-03T05:00:00.000Z", reason: "Vacaciones de Ana" }
    ];
    const calendar = formatUpcomingDays(THURSDAY_NIGHT, TZ, monToSat, blocks);
    expect(calendar).toContain("- Mañana, viernes 30 de octubre (2026-10-30): cerrado (Festivo) aunque normalmente abre");
    expect(calendar).toContain("- Sábado 31 de octubre (2026-10-31): abierto de 9:00 a. m. a 6:00 p. m., pero sin atención de 12:00 m. a 2:00 p. m. (Almuerzo)");
    // El bloqueo de un solo recurso no cierra el negocio (eso lo resuelve consultar_disponibilidad).
    expect(calendar).toContain("- Lunes 2 de noviembre (2026-11-02): abierto de 9:00 a. m. a 6:00 p. m.");
  });

  it("muestra el horario propio de cada recurso y solo de los que lo tienen", () => {
    const resources = [{ id: "r1", name: "Ana (manicurista)" }, { id: "r2", name: "Silla 2" }] as never;
    const text = formatResourceHours(resources, [
      { resource_id: "r1", day_of_week: 0, opening_time: "09:00:00", closing_time: "15:00:00" },
      { resource_id: "r1", day_of_week: 6, opening_time: "09:00:00", closing_time: "17:00:00" }
    ]);
    expect(text).toBe("- Ana (manicurista): sábado de 9:00 a. m. a 5:00 p. m.; domingo de 9:00 a. m. a 3:00 p. m.; los demás días no atiende");
    expect(formatResourceHours(resources, [])).toBeNull();
  });
});

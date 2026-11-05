import { describe, expect, it } from "vitest";
import { verifyAgentReply } from "../src/services/agent/responseVerifier.js";
import { makeData } from "./helpers/agentPromptData.js";

/**
 * Revisión automática de las respuestas del agente: días, horas y precios
 * tienen que salir de los datos del negocio. Los dos primeros casos son los
 * que se vieron en conversaciones reales.
 */

// Jueves 29 de octubre de 2026, 8:45 p. m. en Bogotá.
const NOW = new Date("2026-10-30T01:45:00.000Z");

const period = (day: number, open: string, close: string) => ({
  id: `p-${day}-${open}`,
  organization_id: "org-1",
  day_of_week: day,
  opening_time: open,
  closing_time: close,
  is_closed: false
});

// Barbería: lunes a sábado de 9:00 a. m. a 7:00 p. m.; domingo cerrado.
const barber = makeData({
  hours: [1, 2, 3, 4, 5, 6].map((d) => period(d, "09:00:00", "19:00:00")) as never,
  services: [
    { name: "Corte", duration_minutes: 30, price: 25000, currency: "COP" },
    { name: "Barba", duration_minutes: 20, price: 15000, currency: "COP" }
  ] as never
});

// Restaurante: solo sábados y domingos, de día (8:00 a. m. a 4:00 p. m.).
const weekendRestaurant = makeData({
  hours: [period(6, "08:00:00", "16:00:00"), period(0, "08:00:00", "16:00:00")] as never
});

const kinds = (reply: string, data = barber, tools: string[] = []) => verifyAgentReply(reply, data, NOW, tools).map((i) => i.kind);

describe("verificador de respuestas del agente", () => {
  it("caso real: marca un horario 'de noche' en un negocio que atiende de día", () => {
    const issues = verifyAgentReply("Atendemos los sábados y domingos de 7:00 p. m. a 11:00 p. m.", weekendRestaurant, NOW);
    expect(issues.map((i) => i.detail)).toEqual([
      "Mencionaste las 7:00 p. m., que está fuera del horario de atención del negocio.",
      "Mencionaste las 11:00 p. m., que está fuera del horario de atención del negocio."
    ]);
    expect(kinds("El sábado abrimos a las 9 de la noche", weekendRestaurant)).toEqual(["hour"]);
  });

  it("caso real: marca 'mañana lunes' cuando mañana es viernes", () => {
    const issues = verifyAgentReply("¡Claro! Mañana lunes tenemos cupos desde las 9:00 a. m.", barber, NOW);
    expect(issues.map((i) => i.kind)).toEqual(["date"]);
    expect(issues[0].detail).toBe("Dijiste que mañana es lunes, pero mañana es viernes.");
  });

  it("acepta los horarios, días y fechas correctos", () => {
    expect(kinds("Atendemos de lunes a sábado de 9:00 a. m. a 7:00 p. m.")).toEqual([]);
    expect(kinds("Mañana, viernes 30 de octubre, abrimos a las 9:00 a. m.")).toEqual([]);
    expect(kinds("Hoy jueves ya cerramos; te espero mañana a las 10 de la mañana.")).toEqual([]);
    expect(kinds("Abrimos el sábado y el domingo de 8:00 a. m. a 4:00 p. m.", weekendRestaurant)).toEqual([]);
    expect(kinds("El cierre es a las 12:00 m.", makeData({ hours: [period(1, "08:00:00", "12:00:00")] as never }))).toEqual([]);
  });

  it("marca un día cerrado ofrecido como abierto, pero no cuando dice que está cerrado", () => {
    expect(kinds("El domingo atendemos normalmente, ¿te agendo?")).toEqual(["day"]);
    expect(kinds("¿Te reservo para el lunes?", weekendRestaurant)).toEqual(["day"]);
    expect(kinds("El domingo no atendemos, pero el lunes abrimos a las 9:00 a. m.")).toEqual([]);
    expect(kinds("Los domingos está cerrado.")).toEqual([]);
  });

  it("marca 'mañana abrimos' cuando mañana el negocio no atiende", () => {
    // Mañana es viernes y el restaurante solo abre fines de semana.
    expect(kinds("Sí, mañana abrimos desde temprano.", weekendRestaurant)).toEqual(["day"]);
    // "de la mañana" es la hora, no el día siguiente.
    expect(kinds("El sábado abrimos a las 8 de la mañana.", weekendRestaurant)).toEqual([]);
  });

  it("respeta los bloqueos de todo el día (festivos)", () => {
    const holiday = makeData({
      ...barber,
      blocks: [{ resource_id: null, starts_at: "2026-10-30T05:00:00.000Z", ends_at: "2026-10-31T05:00:00.000Z", reason: "Festivo" }]
    });
    expect(kinds("Mañana atendemos de 9:00 a. m. a 7:00 p. m.", holiday)).toEqual(["day"]);
  });

  it("marca una fecha cuyo día de la semana no coincide", () => {
    expect(kinds("Te espero el lunes 30 de octubre.")).toEqual(["date"]);
    expect(kinds("Te espero el viernes 30 de octubre.")).toEqual([]);
  });

  it("compara las horas con el horario del día que se nombra", () => {
    const saturdayShort = makeData({
      hours: [period(5, "09:00:00", "19:00:00"), period(6, "09:00:00", "13:00:00")] as never
    });
    expect(kinds("El sábado atendemos hasta las 6:00 p. m.", saturdayShort)).toEqual(["hour"]);
    expect(kinds("El viernes atendemos hasta las 6:00 p. m.", saturdayShort)).toEqual([]);
  });

  it("da por válidas las horas que devolvió una herramienta y las de los recursos con horario propio", () => {
    const tools = [JSON.stringify({ success: true, data: { horarios: [{ hora: "20:00", cuando: "viernes 30 de octubre a las 8:00 p. m." }] } })];
    expect(kinds("Tengo libre mañana a las 8:00 p. m.", barber, tools)).toEqual([]);
    const withResource = makeData({
      ...barber,
      resourceHours: [{ resource_id: "r1", day_of_week: 5, opening_time: "19:00:00", closing_time: "21:00:00" }]
    });
    expect(kinds("Carlos atiende el viernes hasta las 9:00 p. m.", withResource)).toEqual([]);
  });

  it("no marca horas ambiguas que puedan leerse dentro del horario", () => {
    // "9:00" sin a. m./p. m. puede ser 9 de la mañana.
    expect(kinds("Abrimos a las 9:00.")).toEqual([]);
  });

  it("marca precios que no son del negocio y acepta los reales, combinados o del anticipo", () => {
    expect(kinds("El corte cuesta $32.000.")).toEqual(["price"]);
    expect(kinds("El corte vale 18 mil pesos.")).toEqual(["price"]);
    expect(kinds("El corte cuesta $25.000 y la barba 15.000 COP.")).toEqual([]);
    expect(kinds("Dos cortes serían $50.000; corte y barba, $40.000.")).toEqual([]);
    const withDeposit = makeData({ ...barber, businessProfile: { ...barber.businessProfile, deposit_percentage: 50 } });
    expect(kinds("El anticipo es de $12.500.", withDeposit)).toEqual([]);
    expect(kinds("El anticipo es de $9.000.", barber, [JSON.stringify({ deposit_amount: 9000 })])).toEqual([]);
  });

  it("marca un precio cuando el negocio no cargó ninguno", () => {
    expect(kinds("La consulta cuesta $50.000.", makeData())).toEqual(["price"]);
  });
});

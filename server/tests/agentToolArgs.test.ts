import { describe, expect, it } from "vitest";
import { crearReservaSchema, consultarDisponibilidadSchema, normalizeTime, normalizeDate } from "../src/services/agent/tools.js";

/**
 * Un detalle de formato en lo que manda el modelo no puede dejar al cliente
 * sin su reserva: antes cualquier variación devolvía VALIDATION_ERROR y el
 * agente terminaba pidiéndole que contactara al negocio.
 */
describe("argumentos de las herramientas del agente", () => {
  it("normaliza las horas que escriben los modelos", () => {
    expect(normalizeTime("9:00")).toBe("09:00");
    expect(normalizeTime("15:00:00")).toBe("15:00");
    expect(normalizeTime("3:30 pm")).toBe("15:30");
    expect(normalizeTime("3 p.m.")).toBe("15:00");
    expect(normalizeTime("12:00 am")).toBe("00:00");
    expect(normalizeTime("15")).toBe("15"); // ambiguo: no se adivina
    expect(normalizeTime("25:00")).toBe("25:00");
  });

  it("toma la fecha aunque venga con hora", () => {
    expect(normalizeDate("2026-11-07T15:00:00")).toBe("2026-11-07");
    expect(normalizeDate(" 2026-11-07 ")).toBe("2026-11-07");
  });

  it("crear_reserva acepta Telegram sin teléfono y números como texto", () => {
    const args = crearReservaSchema.parse({ fecha: "2026-11-07", hora: "9:00", nombre_cliente: "Javier", telefono_cliente: "", cantidad_personas: "2" });
    expect(args.hora).toBe("09:00");
    expect(args.cantidad_personas).toBe(2);
    expect(crearReservaSchema.safeParse({ fecha: "2026-11-07", hora: "10:00", nombre_cliente: "Javier" }).success).toBe(true);
  });

  it("sigue rechazando lo que no se puede adivinar, con un mensaje claro", () => {
    const result = crearReservaSchema.safeParse({ fecha: "2026-11-07", hora: "10:00", nombre_cliente: "Javier", service_id: "Corte de cabello" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/consultar_servicios/);
    expect(crearReservaSchema.safeParse({ fecha: "2026-11-07", hora: "10:00", nombre_cliente: " " }).success).toBe(false);
  });

  it("consultar_disponibilidad tolera null en los opcionales", () => {
    expect(consultarDisponibilidadSchema.safeParse({ fecha: "2026-11-07", hora_preferida: null, service_id: null, cantidad_personas: null }).success).toBe(true);
  });
});

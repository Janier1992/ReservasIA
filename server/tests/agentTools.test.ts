import { describe, expect, it } from "vitest";
import { crearReservaSchema, consultarDisponibilidadSchema, getToolDefinitionsForAgent } from "../src/services/agent/tools.js";
import type { AgentConfig } from "../src/types/domain.js";

const baseAgentConfig: AgentConfig = {
  id: "agent-1",
  organization_id: "org-1",
  name: "Valentina",
  enabled: true,
  language: "es",
  tone: "friendly",
  system_instructions: null,
  booking_enabled: true,
  cancellation_enabled: true,
  rescheduling_enabled: true
};

describe("agent tool argument validation", () => {
  it("rejects consultar_disponibilidad without fecha", () => {
    expect(() => consultarDisponibilidadSchema.parse({})).toThrow();
  });

  it("acepta consultar_disponibilidad solo con fecha", () => {
    expect(() => consultarDisponibilidadSchema.parse({ fecha: "2026-09-07" })).not.toThrow();
  });

  it("rejects crear_reserva missing required customer data", () => {
    expect(() => crearReservaSchema.parse({ fecha: "2026-09-07", hora: "10:00" })).toThrow();
  });

  it("acepta un crear_reserva completo", () => {
    expect(() =>
      crearReservaSchema.parse({
        fecha: "2026-09-07",
        hora: "10:00",
        nombre_cliente: "Camila",
        telefono_cliente: "+573001112233"
      })
    ).not.toThrow();
  });

  it("acepta crear_reserva con un metodo_pago válido", () => {
    expect(() =>
      crearReservaSchema.parse({
        fecha: "2026-09-07",
        hora: "10:00",
        nombre_cliente: "Camila",
        telefono_cliente: "+573001112233",
        metodo_pago: "anticipado"
      })
    ).not.toThrow();
  });

  it("rechaza crear_reserva con un metodo_pago inválido", () => {
    expect(() =>
      crearReservaSchema.parse({
        fecha: "2026-09-07",
        hora: "10:00",
        nombre_cliente: "Camila",
        telefono_cliente: "+573001112233",
        metodo_pago: "efectivo"
      })
    ).toThrow();
  });

  it("acepta crear_reserva con repetir_semanas", () => {
    expect(() =>
      crearReservaSchema.parse({
        fecha: "2026-09-07",
        hora: "10:00",
        nombre_cliente: "Camila",
        telefono_cliente: "+573001112233",
        repetir_semanas: 4
      })
    ).not.toThrow();
  });

  it("rejects repetir_semanas below 2 or above 12", () => {
    const base = { fecha: "2026-09-07", hora: "10:00", nombre_cliente: "Camila", telefono_cliente: "+573001112233" };
    expect(() => crearReservaSchema.parse({ ...base, repetir_semanas: 1 })).toThrow();
    expect(() => crearReservaSchema.parse({ ...base, repetir_semanas: 13 })).toThrow();
  });
});

describe("getToolDefinitionsForAgent", () => {
  it("incluye todas las herramientas cuando todas las capacidades están activas", () => {
    const names = getToolDefinitionsForAgent(baseAgentConfig).map((t) => t.function.name);
    expect(names).toContain("crear_reserva");
    expect(names).toContain("cancelar_reserva");
    expect(names).toContain("reprogramar_reserva");
  });

  it("omite crear_reserva cuando las reservas están desactivadas", () => {
    const names = getToolDefinitionsForAgent({ ...baseAgentConfig, booking_enabled: false }).map((t) => t.function.name);
    expect(names).not.toContain("crear_reserva");
  });

  it("nunca expone herramientas que modifican datos en la vista previa, aunque estén activas", () => {
    const names = getToolDefinitionsForAgent(baseAgentConfig, { previewMode: true }).map((t) => t.function.name);
    expect(names).not.toContain("crear_reserva");
    expect(names).not.toContain("cancelar_reserva");
    expect(names).not.toContain("reprogramar_reserva");
    expect(names).toContain("consultar_disponibilidad");
  });
});

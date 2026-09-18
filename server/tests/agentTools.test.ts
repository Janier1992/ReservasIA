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

  it("accepts consultar_disponibilidad with only fecha", () => {
    expect(() => consultarDisponibilidadSchema.parse({ fecha: "2026-09-07" })).not.toThrow();
  });

  it("rejects crear_reserva missing required customer data", () => {
    expect(() => crearReservaSchema.parse({ fecha: "2026-09-07", hora: "10:00" })).toThrow();
  });

  it("accepts a complete crear_reserva payload", () => {
    expect(() =>
      crearReservaSchema.parse({
        fecha: "2026-09-07",
        hora: "10:00",
        nombre_cliente: "Camila",
        telefono_cliente: "+573001112233"
      })
    ).not.toThrow();
  });

  it("accepts crear_reserva with a valid metodo_pago", () => {
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

  it("rejects crear_reserva with an invalid metodo_pago", () => {
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
});

describe("getToolDefinitionsForAgent", () => {
  it("includes all tools when every capability is enabled", () => {
    const names = getToolDefinitionsForAgent(baseAgentConfig).map((t) => t.function.name);
    expect(names).toContain("crear_reserva");
    expect(names).toContain("cancelar_reserva");
    expect(names).toContain("reprogramar_reserva");
  });

  it("omits crear_reserva when booking is disabled", () => {
    const names = getToolDefinitionsForAgent({ ...baseAgentConfig, booking_enabled: false }).map((t) => t.function.name);
    expect(names).not.toContain("crear_reserva");
  });

  it("never exposes mutating tools in preview mode, even if enabled", () => {
    const names = getToolDefinitionsForAgent(baseAgentConfig, { previewMode: true }).map((t) => t.function.name);
    expect(names).not.toContain("crear_reserva");
    expect(names).not.toContain("cancelar_reserva");
    expect(names).not.toContain("reprogramar_reserva");
    expect(names).toContain("consultar_disponibilidad");
  });
});

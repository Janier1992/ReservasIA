import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/services/agent/promptBuilder.js";
import { CORE_AGENT_RULES } from "../src/services/agent/coreRules.js";
import { makeData } from "./helpers/agentPromptData.js";

describe("buildSystemPrompt", () => {
  it("es genérico: nombra al negocio según sus datos y nunca fija un tipo de negocio en la presentación del agente", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    expect(prompt).toContain("Sos Max, el asistente virtual de Barbería El Corte.");
    expect(prompt.toLowerCase()).not.toContain("sos la anfitriona de un restaurante");
  });

  it("siempre incluye completas y textuales las reglas críticas de reservas", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    expect(prompt).toContain(CORE_AGENT_RULES);
  });

  it("pone las instrucciones propias del negocio después de las reglas base, nunca antes", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    const coreIndex = prompt.indexOf(CORE_AGENT_RULES);
    const customIndex = prompt.indexOf("Ofrecé siempre agua o café al cliente.");
    expect(coreIndex).toBeGreaterThan(-1);
    expect(customIndex).toBeGreaterThan(coreIndex);
  });

  it("refleja otro negocio sin cambiar código cuando recibe los datos de un restaurante", () => {
    const prompt = buildSystemPrompt(
      makeData({
        organization: { id: "org-2", businessType: "restaurant", timezone: "America/Bogota", status: "active" },
        agentConfig: {
          id: "agent-2",
          organization_id: "org-2",
          name: "Sofía",
          enabled: true,
          language: "es",
          tone: "friendly",
          system_instructions: null,
          booking_enabled: true,
          cancellation_enabled: true,
          rescheduling_enabled: true
        },
        businessProfile: { ...makeData().businessProfile, organization_id: "org-2", name: "La Buena Mesa" }
      }),
      new Date("2026-09-07T15:00:00Z")
    );
    expect(prompt).toContain("Sos Sofía, el asistente virtual de La Buena Mesa.");
    expect(prompt).toContain("Tipo de negocio: Restaurante");
  });
});

describe("buildSystemPrompt: guía por rubro", () => {
  const now = new Date("2026-09-07T15:00:00Z");
  const withType = (businessType: string) =>
    buildSystemPrompt(makeData({ organization: { id: "org-1", businessType, timezone: "America/Bogota", status: "active" } }), now);

  it("muestra el tipo de negocio en español en vez del identificador interno", () => {
    expect(withType("auto_repair")).toContain("Tipo de negocio: Taller mecánico");
  });

  it("usa el valor tal cual para un tipo de negocio fuera del catálogo", () => {
    expect(withType("floristeria")).toContain("Tipo de negocio: floristeria");
  });

  it("pide al agente de una veterinaria el nombre y la especie de la mascota y le prohíbe diagnosticar", () => {
    const prompt = withType("veterinary");
    expect(prompt).toContain("GUÍA PARA ESTE TIPO DE NEGOCIO (Veterinaria");
    expect(prompt).toContain("nombre de la mascota");
    expect(prompt).toContain("Nunca des diagnósticos");
  });

  it("pide al agente de un taller la placa del vehículo", () => {
    expect(withType("auto_repair")).toContain("placa del vehículo");
  });

  it("pide al agente de un lavadero el tipo de vehículo y la placa, sin prometer resultados", () => {
    const prompt = withType("car_wash");
    expect(prompt).toContain("Tipo de negocio: Lavadero de vehículos");
    expect(prompt).toContain("tipo de vehículo");
    expect(prompt).toContain("No prometas resultados");
  });

  it("indica a los agentes de salud que deriven las emergencias en vez de agendarlas", () => {
    for (const type of ["dental", "clinic", "physiotherapy"]) {
      expect(withType(type)).toContain("línea de emergencias");
    }
  });

  it("pone la guía del rubro después de las reglas base y antes de las instrucciones del negocio", () => {
    const prompt = withType("academy");
    const coreIndex = prompt.indexOf(CORE_AGENT_RULES);
    const guidanceIndex = prompt.indexOf("GUÍA PARA ESTE TIPO DE NEGOCIO");
    const customIndex = prompt.indexOf("Ofrecé siempre agua o café al cliente.");
    expect(guidanceIndex).toBeGreaterThan(coreIndex);
    expect(customIndex).toBeGreaterThan(guidanceIndex);
  });

  it("no agrega guía del rubro a los tipos de negocio que no la necesitan", () => {
    expect(withType("barbershop")).not.toContain("GUÍA PARA ESTE TIPO DE NEGOCIO");
  });
});

describe("buildSystemPrompt: sección de pagos", () => {
  it("indica al agente que no mencione anticipos cuando están desactivados", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    expect(prompt).toContain("Este negocio no pide anticipo. No menciones pagos por adelantado.");
  });

  it("describe un anticipo obligatorio con el número de Nequi, sin inventar un monto", () => {
    const prompt = buildSystemPrompt(
      makeData({
        businessProfile: {
          ...makeData().businessProfile,
          deposit_enabled: true,
          deposit_mandatory: true,
          deposit_percentage: 50,
          nequi_phone: "3001234567"
        }
      }),
      new Date("2026-09-07T15:00:00Z")
    );
    expect(prompt).toContain("Anticipo OBLIGATORIO del 50% del precio del servicio, a pagar por Nequi al número 3001234567.");
    expect(prompt).toContain("nunca los calcules ni los repitas de memoria");
  });

  it("describe un anticipo opcional distinto de uno obligatorio", () => {
    const prompt = buildSystemPrompt(
      makeData({
        businessProfile: {
          ...makeData().businessProfile,
          deposit_enabled: true,
          deposit_mandatory: false,
          deposit_percentage: 30,
          nequi_phone: "3009876543"
        }
      }),
      new Date("2026-09-07T15:00:00Z")
    );
    expect(prompt).toContain("Anticipo opcional (dejale elegir al cliente) del 30%");
  });
});

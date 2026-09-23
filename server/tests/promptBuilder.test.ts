import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/services/agent/promptBuilder.js";
import { CORE_AGENT_RULES } from "../src/services/agent/coreRules.js";
import type { AgentPromptData } from "../src/services/agent/promptBuilder.js";

function makeData(overrides: Partial<AgentPromptData> = {}): AgentPromptData {
  return {
    organization: { id: "org-1", businessType: "barbershop", timezone: "America/Bogota", status: "active" },
    agentConfig: {
      id: "agent-1",
      organization_id: "org-1",
      name: "Max",
      enabled: true,
      language: "es",
      tone: "casual",
      system_instructions: "Ofrecé siempre agua o café al cliente.",
      booking_enabled: true,
      cancellation_enabled: true,
      rescheduling_enabled: true
    },
    businessProfile: {
      id: "bp-1",
      organization_id: "org-1",
      name: "Barbería El Corte",
      description: null,
      address: null,
      phone: null,
      email: null,
      website: null,
      business_type: "barbershop",
      category: null,
      currency: "COP",
      timezone: "America/Bogota",
      capacity_total: null,
      reservation_duration_minutes: 30,
      slot_interval_minutes: 30,
      advance_booking_hours: 1,
      max_booking_days: 45,
      cancellation_policy: null,
      special_instructions: null,
      nequi_phone: null,
      deposit_enabled: false,
      deposit_mandatory: false,
      deposit_percentage: null
    },
    services: [],
    resources: [],
    hours: [],
    agentRules: [],
    customer: null,
    googleCalendarConnected: false,
    ...overrides
  };
}

describe("buildSystemPrompt", () => {
  it("is generic: names the business dynamically, never hardcodes a business type in the persona line", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    expect(prompt).toContain("Sos Max, el asistente virtual de Barbería El Corte.");
    expect(prompt.toLowerCase()).not.toContain("sos la anfitriona de un restaurante");
  });

  it("always embeds the full set of critical booking rules verbatim", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    expect(prompt).toContain(CORE_AGENT_RULES);
  });

  it("places custom business instructions after the core rules, never before", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    const coreIndex = prompt.indexOf(CORE_AGENT_RULES);
    const customIndex = prompt.indexOf("Ofrecé siempre agua o café al cliente.");
    expect(coreIndex).toBeGreaterThan(-1);
    expect(customIndex).toBeGreaterThan(coreIndex);
  });

  it("reflects a different business without any code changes when given restaurant data", () => {
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

describe("buildSystemPrompt business type guidance", () => {
  const now = new Date("2026-09-07T15:00:00Z");
  const withType = (businessType: string) =>
    buildSystemPrompt(makeData({ organization: { id: "org-1", businessType, timezone: "America/Bogota", status: "active" } }), now);

  it("shows the business type in Spanish instead of the internal slug", () => {
    expect(withType("auto_repair")).toContain("Tipo de negocio: Taller mecánico");
  });

  it("falls back to the raw value for a business type outside the catalog", () => {
    expect(withType("floristeria")).toContain("Tipo de negocio: floristeria");
  });

  it("asks a veterinary agent for the pet's name and species and forbids diagnoses", () => {
    const prompt = withType("veterinary");
    expect(prompt).toContain("GUÍA PARA ESTE TIPO DE NEGOCIO (Veterinaria");
    expect(prompt).toContain("nombre de la mascota");
    expect(prompt).toContain("Nunca des diagnósticos");
  });

  it("asks an auto repair agent for the vehicle's plate", () => {
    expect(withType("auto_repair")).toContain("placa del vehículo");
  });

  it("tells health-related agents to redirect emergencies instead of booking them", () => {
    for (const type of ["dental", "clinic", "physiotherapy"]) {
      expect(withType(type)).toContain("línea de emergencias");
    }
  });

  it("places the guidance after the core rules and before the business's own instructions", () => {
    const prompt = withType("academy");
    const coreIndex = prompt.indexOf(CORE_AGENT_RULES);
    const guidanceIndex = prompt.indexOf("GUÍA PARA ESTE TIPO DE NEGOCIO");
    const customIndex = prompt.indexOf("Ofrecé siempre agua o café al cliente.");
    expect(guidanceIndex).toBeGreaterThan(coreIndex);
    expect(customIndex).toBeGreaterThan(guidanceIndex);
  });

  it("adds no guidance section for business types that don't need one", () => {
    expect(withType("barbershop")).not.toContain("GUÍA PARA ESTE TIPO DE NEGOCIO");
  });
});

describe("buildSystemPrompt payment policy section", () => {
  it("tells the agent not to mention advance payments when deposits are disabled", () => {
    const prompt = buildSystemPrompt(makeData(), new Date("2026-09-07T15:00:00Z"));
    expect(prompt).toContain("Este negocio no pide anticipo. No menciones pagos por adelantado.");
  });

  it("describes a mandatory deposit with the Nequi number, without inventing an amount", () => {
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

  it("describes an optional deposit distinctly from a mandatory one", () => {
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

import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/services/agent/promptBuilder.js";
import { CORE_AGENT_RULES } from "../src/services/agent/coreRules.js";
import type { AgentPromptData } from "../src/services/agent/promptBuilder.js";

function makeData(overrides: Partial<AgentPromptData> = {}): AgentPromptData {
  return {
    organization: { id: "org-1", businessType: "barbershop", timezone: "America/Bogota" },
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
      special_instructions: null
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
        organization: { id: "org-2", businessType: "restaurant", timezone: "America/Bogota" },
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
    expect(prompt).toContain("Tipo de negocio: restaurant");
  });
});

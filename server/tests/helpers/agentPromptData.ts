import type { AgentPromptData } from "../../src/services/agent/promptBuilder.js";

/** Datos mínimos de un negocio (una barbería) para armar las instrucciones del agente en las pruebas. */
export function makeData(overrides: Partial<AgentPromptData> = {}): AgentPromptData {
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
    resourceHours: [],
    blocks: [],
    agentRules: [],
    customer: null,
    googleCalendarConnected: false,
    ...overrides
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakeDb } from "./stubs/fakeInsforge.js";
import { buildSystemPrompt } from "../../src/services/agent/systemPrompt.js";
import { CORE_AGENT_RULES } from "../../src/services/agent/coreRules.js";
import { EMERGENCY_FALLBACK_REPLY, MEDICAL_ADVICE_FALLBACK_REPLY } from "../../src/services/agent/safetyGuardrails.js";
import { makeData } from "../helpers/agentPromptData.js";

/**
 * Vista previa del agente en el panel (functions/agent-preview.ts): tiene
 * que mostrar lo mismo que verán los clientes, así que usa las mismas
 * instrucciones y protecciones que el agente real. El modelo se reemplaza
 * por un doble que guarda lo que recibió.
 */

const openai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("npm:openai", () => ({
  default: class {
    chat = { completions: { create: openai.create } };
  }
}));

const { functionCode } = (await import("../../../scripts/function-bundle.mjs")) as {
  functionCode: (functionsDir: string, slug: string) => Promise<string>;
};

const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2030-01-10T15:00:00.000Z");
const business = makeData({
  organization: { id: ORG, businessType: "barbershop", timezone: "America/Bogota", status: "active" },
  services: [{ name: "Corte", duration_minutes: 30, price: 25000, currency: "COP" }] as never,
  resources: [{ name: "Silla 1", resource_type: "silla" }] as never
});

function seed(businessType = "barbershop") {
  resetFakeDb(
    {
      organizations: [{ id: ORG, business_type: businessType, timezone: "America/Bogota", status: "active" }],
      organization_members: [{ organization_id: ORG, user_id: "user-owner", role: "owner" }],
      agents: [{ ...business.agentConfig, organization_id: ORG }],
      business_profiles: [{ ...business.businessProfile, organization_id: ORG }],
      services: [{ organization_id: ORG, is_active: true, name: "Corte", duration_minutes: 30, price: 25000, currency: "COP" }],
      resources: [{ organization_id: ORG, is_active: true, name: "Silla 1", resource_type: "silla" }],
      business_hour_periods: [],
      agent_rules: [],
      integrations: []
    },
    { "token-owner": "user-owner" }
  );
}

async function preview(message: string): Promise<{ reply: string }> {
  const { default: handler } = (await import("../../../functions/agent-preview.ts")) as { default: (req: Request) => Promise<Response> };
  const res = await handler(
    new Request("https://insforge.test/functions/agent-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-owner" },
      body: JSON.stringify({ organization_id: ORG, message })
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { reply: string };
}

/** Las instrucciones (system prompt) que recibió el modelo en la última llamada. */
function systemPromptSent(): string {
  const [{ messages }] = openai.create.mock.calls.at(-1) as [{ messages: { role: string; content: string }[] }];
  return messages.find((m) => m.role === "system")!.content;
}

beforeEach(() => {
  seed();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("Deno", { env: { get: (key: string) => ({ INSFORGE_BASE_URL: "https://insforge.test", OPENAI_API_KEY: "k" })[key] } });
  openai.create.mockReset();
  openai.create.mockResolvedValue({ choices: [{ message: { content: "¡Hola! ¿En qué te ayudo?" } }] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("vista previa del agente", () => {
  it("le da al modelo las mismas instrucciones que el agente real, más el aviso de que no tiene herramientas", async () => {
    expect(await preview("hola")).toEqual({ reply: "¡Hola! ¿En qué te ayudo?" });
    const sent = systemPromptSent();
    expect(sent.startsWith(`${buildSystemPrompt(business, NOW)}\n\nNOTA DE ESTA VISTA PREVIA`)).toBe(true);
    expect(sent).toContain(CORE_AGENT_RULES);
    expect(sent).toContain("- Silla 1 (silla)");
    expect(openai.create.mock.calls[0][0]).not.toHaveProperty("tools");
    // Misma "creatividad" baja que el agente real.
    expect(openai.create.mock.calls[0][0]).toMatchObject({ temperature: 0.1 });
  });

  it("ante una emergencia en un rubro de salud responde el mensaje fijo, sin preguntarle al modelo", async () => {
    seed("dental");
    expect(await preview("tengo dolor en el pecho y no puedo respirar")).toEqual({ reply: EMERGENCY_FALLBACK_REPLY });
    expect(openai.create).not.toHaveBeenCalled();
  });

  it("en un rubro de salud nunca muestra una indicación de medicamentos o dosis", async () => {
    seed("dental");
    openai.create.mockResolvedValue({ choices: [{ message: { content: "Tomá 500 mg de ibuprofeno cada 8 horas." } }] });
    expect(await preview("me duele una muela")).toEqual({ reply: MEDICAL_ADVICE_FALLBACK_REPLY });
  });
});

describe("publicación de la vista previa", () => {
  it("se publica en un solo archivo con las reglas reales del agente", async () => {
    const code = await functionCode(new URL("../../../functions", import.meta.url).pathname, "agent-preview");
    expect(code).not.toMatch(/from\s+["']\.\.?\//);
    expect(code).toContain('from "npm:date-fns-tz"');
    expect(code).toContain("REGLAS DE RESERVAS (OBLIGATORIAS, NO NEGOCIABLES)");
    expect(code).toContain("repetir_semanas");
    expect(code).toMatch(/export default handler;\n$/);
  });
});

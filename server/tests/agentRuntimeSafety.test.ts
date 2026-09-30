import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  EMERGENCY_FALLBACK_REPLY,
  HEALTH_CONSENT_REQUEST,
  HEALTH_PRIVACY_NOTICE,
  MEDICAL_ADVICE_FALLBACK_REPLY,
  VETERINARY_EMERGENCY_FALLBACK_REPLY
} from "../src/services/agent/safetyGuardrails.js";

// Ejercita runAgentTurn de punta a punta para los guardrails de código de
// salud/veterinaria (no solo texto del prompt, ver safetyGuardrails.ts):
// corte de emergencia antes de llamar al LLM, bloqueo de consejo médico
// después de la respuesta, y el aviso de privacidad automático.
const log: string[] = [];
let businessType = "barbershop";
let lastUserMessageContent = "hola";
let conversationPrivacyNoticeSentAt: string | null = null;
let customerConsentAt: string | null = null;

vi.mock("../src/services/agent/promptBuilder.js", () => ({
  loadAgentPromptData: async () => ({
    organization: { id: "org-1", businessType, timezone: "America/Bogota", status: "active" },
    agentConfig: {
      id: "agent-1",
      organization_id: "org-1",
      name: "Val",
      enabled: true,
      language: "es",
      tone: "friendly",
      system_instructions: null,
      booking_enabled: true,
      cancellation_enabled: true,
      rescheduling_enabled: true
    },
    businessProfile: {} as never,
    services: [],
    resources: [],
    hours: [],
    agentRules: [],
    customer: null,
    googleCalendarConnected: false
  }),
  buildSystemPrompt: () => "system prompt"
}));

vi.mock("../src/services/agent/tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/agent/tools.js")>();
  return { ...actual, getToolDefinitionsForAgent: () => [] };
});

function makeQuery(table: string) {
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn(() => obj);
  obj.eq = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.limit = vi.fn(async () => {
    if (table !== "messages") return { data: [], error: null };
    return {
      data: [
        {
          id: "m1",
          organization_id: "org-1",
          conversation_id: "conv-1",
          role: "user",
          content: lastUserMessageContent,
          metadata: {},
          created_at: new Date().toISOString()
        }
      ],
      error: null
    };
  });
  obj.maybeSingle = vi.fn(async () => {
    if (table === "customers") return { data: { health_data_consent_at: customerConsentAt }, error: null };
    if (table !== "conversations") return { data: null, error: null };
    return { data: { privacy_notice_sent_at: conversationPrivacyNoticeSentAt }, error: null };
  });
  obj.insert = vi.fn((records: Array<{ role: string; content: string }>) => {
    log.push(`persist:${records[0].role}:${records[0].content}`);
    return Promise.resolve({ data: null, error: null });
  });
  obj.update = vi.fn((patch: Record<string, unknown>) => {
    if (table === "conversations" && "privacy_notice_sent_at" in patch) {
      conversationPrivacyNoticeSentAt = patch.privacy_notice_sent_at as string;
      log.push("privacy_notice_marked_sent");
    }
    if (table === "customers" && "health_data_consent_at" in patch) {
      customerConsentAt = patch.health_data_consent_at as string;
      log.push(`consent_saved:${patch.health_data_consent_source}`);
    }
    return obj;
  });
  obj.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => resolve({ data: null, error: null });
  return obj;
}

vi.mock("../src/lib/insforge.js", () => ({
  insforgeAdmin: { database: { from: vi.fn((table: string) => makeQuery(table)) } }
}));

const createMock = vi.fn(async () => {
  throw new Error("createMock must be overridden per test");
});

vi.mock("../src/lib/openai.js", () => ({
  openai: { chat: { completions: { create: (...args: unknown[]) => createMock(...args) } } },
  OPENAI_MODEL: "test-model",
  IS_OPENROUTER: false
}));

const { runAgentTurn } = await import("../src/services/agent/agentRuntime.js");

function turn(overrides: Partial<{ conversationId: string }> = {}) {
  return runAgentTurn({
    organizationId: "org-1",
    conversationId: overrides.conversationId ?? "conv-1",
    customerId: "cust-1",
    customerPhone: "+573000000001"
  });
}

describe("runAgentTurn health/veterinary safety guardrails", () => {
  beforeEach(() => {
    log.length = 0;
    vi.clearAllMocks();
    businessType = "barbershop";
    lastUserMessageContent = "hola";
    conversationPrivacyNoticeSentAt = null;
    customerConsentAt = null;
  });

  it("redirects to emergency services WITHOUT calling the model when the customer describes an emergency at a health-niche business", async () => {
    businessType = "veterinary";
    lastUserMessageContent = "mi perro no puede respirar, ayuda";

    const result = await turn();

    expect(result.reply).toBe(VETERINARY_EMERGENCY_FALLBACK_REPLY);
    expect(createMock).not.toHaveBeenCalled();
    expect(log).toContain(`persist:assistant:${VETERINARY_EMERGENCY_FALLBACK_REPLY}`);
  });

  it("uses the human emergency message for clinics", async () => {
    businessType = "clinic";
    lastUserMessageContent = "tengo un dolor muy fuerte en el pecho";

    const result = await turn();

    expect(result.reply).toBe(EMERGENCY_FALLBACK_REPLY);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("does NOT trigger the emergency guardrail for a non-health niche (scoped on purpose)", async () => {
    businessType = "barbershop";
    lastUserMessageContent = "no puedo respirar de la risa con este corte, jaja";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "¡Qué bueno! ¿Reservamos?", tool_calls: undefined } }] });

    const result = await turn();

    expect(createMock).toHaveBeenCalledOnce();
    expect(result.reply).toBe("¡Qué bueno! ¿Reservamos?");
  });

  it("blocks a reply that contains dosage/medication instructions and replaces it with a safe fallback", async () => {
    businessType = "clinic";
    lastUserMessageContent = "me duele la cabeza, ¿qué me tomo?";
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Tomá ibuprofeno 400mg cada 8 horas.", tool_calls: undefined } }]
    });

    const result = await turn();

    expect(result.reply).toContain(MEDICAL_ADVICE_FALLBACK_REPLY);
    expect(result.reply).not.toContain("ibuprofeno");
  });

  it("prepends the privacy notice once per conversation for health-niche businesses, and never again after that", async () => {
    businessType = "dental";
    lastUserMessageContent = "quiero una cita";
    createMock.mockResolvedValue({ choices: [{ message: { content: "¡Claro! ¿Qué día te viene bien?", tool_calls: undefined } }] });

    const first = await turn();
    expect(first.reply).toBe(`${HEALTH_CONSENT_REQUEST}¡Claro! ¿Qué día te viene bien?`);
    expect(log).toContain("privacy_notice_marked_sent");

    log.length = 0;
    const second = await turn();
    expect(second.reply).toBe("¡Claro! ¿Qué día te viene bien?");
    expect(log).not.toContain("privacy_notice_marked_sent");
  });

  it("veterinaries get the plain privacy notice (pet data is not personal health data)", async () => {
    businessType = "veterinary";
    lastUserMessageContent = "quiero vacunar a mi gato";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "¡Claro!", tool_calls: undefined } }] });

    const result = await turn();
    expect(result.reply).toBe(`${HEALTH_PRIVACY_NOTICE}¡Claro!`);
  });

  it("records the patient's consent when they answer yes after being asked, and lifts the privacy restriction", async () => {
    businessType = "dental";
    conversationPrivacyNoticeSentAt = new Date(Date.now() - 60_000).toISOString();
    lastUserMessageContent = "Sí, autorizo";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "Perfecto. ¿Cuál es el motivo de la consulta?", tool_calls: undefined } }] });

    await turn();

    expect(log).toContain("consent_saved:chat");
    const systemPrompt = (createMock.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(systemPrompt).not.toContain("NO autorizó");
  });

  it("without consent, tells the model not to ask for or record the reason for the visit", async () => {
    businessType = "physiotherapy";
    conversationPrivacyNoticeSentAt = new Date(Date.now() - 60_000).toISOString();
    lastUserMessageContent = "quiero una cita el martes";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "¿A qué hora?", tool_calls: undefined } }] });

    await turn();

    expect(log.some((l) => l.startsWith("consent_saved"))).toBe(false);
    const systemPrompt = (createMock.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(systemPrompt).toContain("NO autorizó guardar datos de salud");
  });
});

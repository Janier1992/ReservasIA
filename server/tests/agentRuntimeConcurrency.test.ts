import { describe, expect, it, vi, beforeEach } from "vitest";

// Reproduce el bug reportado por el cliente: dos mensajes seguidos por
// WhatsApp disparan dos turnos del agente en paralelo para la misma
// conversación (webhooks.ts no espera runAgentTurn antes de responder al
// webhook de Twilio). Sin serializar por conversationId, el turno más
// rápido persiste su respuesta antes que el turno más lento, aunque haya
// arrancado después — el cliente recibe las respuestas fuera de orden.
const log: string[] = [];

const loadAgentPromptDataMock = vi.fn(async (_organizationId: string, customerId: string | null) => {
  log.push(`loadPromptData:${customerId}`);
  return {
    organization: { id: "org-1", businessType: "generic", timezone: "America/Bogota", status: "active" },
    agentConfig: { id: "agent-1", organization_id: "org-1", name: "Val", enabled: true, language: "es", tone: "friendly", system_instructions: null, booking_enabled: true, cancellation_enabled: true, rescheduling_enabled: true },
    businessProfile: {} as never,
    services: [],
    resources: [],
    hours: [],
    agentRules: [],
    customer: null,
    googleCalendarConnected: false
  };
});

vi.mock("../src/services/agent/promptBuilder.js", () => ({
  loadAgentPromptData: (...args: [string, string | null]) => loadAgentPromptDataMock(...args),
  buildSystemPrompt: () => "system prompt"
}));

vi.mock("../src/services/agent/tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/agent/tools.js")>();
  return { ...actual, getToolDefinitionsForAgent: () => [] };
});

function makeMessagesQuery() {
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn(() => obj);
  obj.eq = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.limit = vi.fn(async () => ({ data: [], error: null }));
  obj.insert = vi.fn(async (records: Array<{ role: string; content: string }>) => {
    log.push(`persist:${records[0].role}:${records[0].content}`);
    return { data: null, error: null };
  });
  return obj;
}

vi.mock("../src/lib/insforge.js", () => ({
  insforgeAdmin: { database: { from: vi.fn(() => makeMessagesQuery()) } }
}));

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const createMock = vi.fn(async () => {
  throw new Error("createMock must be overridden per test");
});

vi.mock("../src/lib/openai.js", () => ({
  openai: { chat: { completions: { create: (...args: unknown[]) => createMock(...args) } } },
  OPENAI_MODEL: "test-model",
  IS_OPENROUTER: false
}));

const { runAgentTurn } = await import("../src/services/agent/agentRuntime.js");

describe("runAgentTurn concurrency", () => {
  beforeEach(() => {
    log.length = 0;
    vi.clearAllMocks();
  });

  it("serializa turnos concurrentes de la misma conversación, aunque el segundo responda más rápido", async () => {
    let call = 0;
    createMock.mockImplementation(async () => {
      call += 1;
      const isFirstCall = call === 1;
      // El primer turno (lento) tarda más que el segundo (rápido) — sin
      // serialización, el segundo terminaría y persistiría su respuesta
      // primero.
      await delay(isFirstCall ? 40 : 5);
      const label = isFirstCall ? "A" : "B";
      log.push(`openaiEnd:${label}`);
      return { choices: [{ message: { content: `respuesta ${label}`, tool_calls: undefined } }] };
    });

    const conversationId = "conv-shared";
    const turnA = runAgentTurn({
      organizationId: "org-1",
      conversationId,
      customerId: "cust-A",
      customerPhone: "+573000000001",
      requestId: "req-A"
    });
    const turnB = runAgentTurn({
      organizationId: "org-1",
      conversationId,
      customerId: "cust-B",
      customerPhone: "+573000000001",
      requestId: "req-B"
    });

    const [resultA, resultB] = await Promise.all([turnA, turnB]);

    expect(resultA.reply).toBe("respuesta A");
    expect(resultB.reply).toBe("respuesta B");

    // El turno B ni siquiera debe empezar a cargar su contexto hasta que A
    // haya persistido su respuesta final.
    expect(log).toEqual([
      "loadPromptData:cust-A",
      "openaiEnd:A",
      "persist:assistant:respuesta A",
      "loadPromptData:cust-B",
      "openaiEnd:B",
      "persist:assistant:respuesta B"
    ]);
  });

  it("no serializa turnos de conversaciones distintas entre sí", async () => {
    createMock.mockImplementation(async () => {
      await delay(5);
      return { choices: [{ message: { content: "ok", tool_calls: undefined } }] };
    });

    const turn1 = runAgentTurn({
      organizationId: "org-1",
      conversationId: "conv-1",
      customerId: "cust-1",
      customerPhone: "+573000000001"
    });
    const turn2 = runAgentTurn({
      organizationId: "org-1",
      conversationId: "conv-2",
      customerId: "cust-2",
      customerPhone: "+573000000002"
    });

    const [result1, result2] = await Promise.all([turn1, turn2]);
    expect(result1.reply).toBe("ok");
    expect(result2.reply).toBe("ok");
    // Ambas cargas de contexto arrancan sin esperarse entre sí.
    expect(log.filter((l) => l.startsWith("loadPromptData"))).toHaveLength(2);
  });
});

describe("runAgentTurn organization status", () => {
  beforeEach(() => {
    log.length = 0;
    vi.clearAllMocks();
  });

  it("never calls the model and replies null when the organization isn't active (suspended/cancelled)", async () => {
    loadAgentPromptDataMock.mockResolvedValueOnce({
      organization: { id: "org-1", businessType: "generic", timezone: "America/Bogota", status: "suspended" },
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
    });

    const result = await runAgentTurn({
      organizationId: "org-1",
      conversationId: "conv-suspended",
      customerId: "cust-1",
      customerPhone: "+573000000001"
    });

    expect(result.reply).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("runAgentTurn output sanitization", () => {
  beforeEach(() => {
    log.length = 0;
    vi.clearAllMocks();
  });

  it("strips a leaked provider control token from the final reply before persisting/returning it", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Podés llamar al negocio. <CPA_DONE>", tool_calls: undefined } }]
    });

    const result = await runAgentTurn({
      organizationId: "org-1",
      conversationId: "conv-sanitize",
      customerId: "cust-1",
      customerPhone: "+573000000001"
    });

    expect(result.reply).toBe("Podés llamar al negocio.");
    expect(log).toContain("persist:assistant:Podés llamar al negocio.");
  });
});

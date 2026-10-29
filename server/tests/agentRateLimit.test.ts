import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Límite de velocidad de los turnos del agente: frena ráfagas por cliente y
 * por negocio, avisa una sola vez y se libera al pasar el minuto. Al final,
 * el recorrido completo por Telegram.
 */

const handleInboundMessageMock = vi.fn();
const runAgentTurnMock = vi.fn();
const sendTelegramMessageMock = vi.fn();

vi.mock("../src/services/conversations/inboundMessageHandler.js", () => ({
  handleInboundMessage: (...args: unknown[]) => handleInboundMessageMock(...args)
}));
vi.mock("../src/services/agent/agentRuntime.js", () => ({
  runAgentTurn: (...args: unknown[]) => runAgentTurnMock(...args)
}));
vi.mock("../src/services/telegram/telegramService.js", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args),
  sendTelegramTypingAction: vi.fn(),
  getTelegramUpdates: vi.fn(),
  listConnectedTelegramBots: vi.fn()
}));

const { checkAgentTurn, MAX_TURNS_PER_BUSINESS_PER_MINUTE, MAX_TURNS_PER_CUSTOMER_PER_MINUTE, RATE_LIMIT_NOTICE, resetAgentRateLimit } =
  await import("../src/services/agent/agentRateLimit.js");
const { processUpdate } = await import("../src/services/telegram/telegramPollingManager.js");

const T0 = 1_900_000_000_000;

beforeEach(() => {
  resetAgentRateLimit();
  vi.clearAllMocks();
});

describe("límite de velocidad del agente", () => {
  it("deja pasar los mensajes normales de un cliente", () => {
    for (let i = 0; i < MAX_TURNS_PER_CUSTOMER_PER_MINUTE; i++) {
      expect(checkAgentTurn("org-1", "whatsapp:+573001", T0 + i * 1000)).toBe("allowed");
    }
  });

  it("frena la ráfaga de un cliente, le avisa una sola vez y se libera al pasar el minuto", () => {
    for (let i = 0; i < MAX_TURNS_PER_CUSTOMER_PER_MINUTE; i++) checkAgentTurn("org-1", "whatsapp:+573001", T0);
    expect(checkAgentTurn("org-1", "whatsapp:+573001", T0 + 1000)).toBe("limited_notify");
    expect(checkAgentTurn("org-1", "whatsapp:+573001", T0 + 2000)).toBe("limited");
    expect(checkAgentTurn("org-1", "whatsapp:+573001", T0 + 60_001)).toBe("allowed");
  });

  it("la ráfaga de un cliente no frena a los demás clientes ni a otros negocios", () => {
    for (let i = 0; i < MAX_TURNS_PER_CUSTOMER_PER_MINUTE + 5; i++) checkAgentTurn("org-1", "whatsapp:+573001", T0);
    expect(checkAgentTurn("org-1", "whatsapp:+573002", T0)).toBe("allowed");
    expect(checkAgentTurn("org-2", "whatsapp:+573001", T0)).toBe("allowed");
  });

  it("pone un tope por negocio para que una ráfaga no deje sin agente al resto", () => {
    for (let i = 0; i < MAX_TURNS_PER_BUSINESS_PER_MINUTE; i++) {
      expect(checkAgentTurn("org-1", `telegram:${i}`, T0)).toBe("allowed");
    }
    expect(checkAgentTurn("org-1", "telegram:nuevo", T0)).toBe("limited_notify");
    expect(checkAgentTurn("org-2", "telegram:nuevo", T0)).toBe("allowed");
  });
});

describe("límite de velocidad en Telegram", () => {
  const update = (n: number) => ({
    update_id: n,
    message: { message_id: n, date: 1, chat: { id: 555, type: "private" as const }, text: `mensaje ${n}` }
  });

  it("guarda todos los mensajes, pero no llama a la IA de más y avisa una vez", async () => {
    handleInboundMessageMock.mockResolvedValue({ duplicate: false, conversationId: "conv-1", customerId: "cust-1" });
    runAgentTurnMock.mockResolvedValue({ reply: "ok", roundsUsed: 1 });

    for (let n = 1; n <= MAX_TURNS_PER_CUSTOMER_PER_MINUTE + 3; n++) await processUpdate("org-1", "bot", update(n));

    expect(handleInboundMessageMock).toHaveBeenCalledTimes(MAX_TURNS_PER_CUSTOMER_PER_MINUTE + 3);
    expect(runAgentTurnMock).toHaveBeenCalledTimes(MAX_TURNS_PER_CUSTOMER_PER_MINUTE);
    expect(sendTelegramMessageMock.mock.calls.filter(([, , text]) => text === RATE_LIMIT_NOTICE)).toHaveLength(1);
  });
});

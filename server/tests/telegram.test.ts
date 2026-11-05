import { describe, expect, it, vi, beforeEach } from "vitest";

const handleInboundMessageMock = vi.fn();
const runAgentTurnMock = vi.fn();
const sendTelegramMessageMock = vi.fn();
const sendTelegramTypingActionMock = vi.fn();

vi.mock("../src/services/conversations/inboundMessageHandler.js", () => ({
  handleInboundMessage: (...args: unknown[]) => handleInboundMessageMock(...args)
}));

vi.mock("../src/services/agent/agentRuntime.js", () => ({
  runAgentTurn: (...args: unknown[]) => runAgentTurnMock(...args)
}));

vi.mock("../src/services/telegram/telegramService.js", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args),
  sendTelegramTypingAction: (...args: unknown[]) => sendTelegramTypingActionMock(...args),
  getTelegramUpdates: vi.fn(),
  listConnectedTelegramBots: vi.fn()
}));

const { processUpdate } = await import("../src/services/telegram/telegramPollingManager.js");

describe("telegramPollingManager.processUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleInboundMessageMock.mockResolvedValue({ conversationId: "conv-1", customerId: "cust-1" });
    runAgentTurnMock.mockResolvedValue({ reply: "¡Hola! ¿En qué te puedo ayudar?", roundsUsed: 1 });
  });

  it("normaliza el id del chat como telegram:<chat_id>, lo guarda, corre el agente y responde", async () => {
    await processUpdate("org-1", "bot-token-abc", {
      update_id: 42,
      message: {
        message_id: 7,
        date: 1234567890,
        chat: { id: 999, type: "private" },
        from: { id: 999, first_name: "Camila" },
        text: "Hola, quiero reservar"
      }
    });

    expect(handleInboundMessageMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      channel: "telegram",
      externalIdentity: "telegram:999",
      externalConversationId: "999",
      content: "Hola, quiero reservar",
      externalMessageId: "7",
      customerName: "Camila"
    });

    expect(runAgentTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        conversationId: "conv-1",
        customerId: "cust-1",
        customerPhone: "telegram:999"
      })
    );

    expect(sendTelegramMessageMock).toHaveBeenCalledWith("bot-token-abc", 999, "¡Hola! ¿En qué te puedo ayudar?");
    // El indicador de "escribiendo..." se manda apenas llega el mensaje, para
    // que el cliente sepa que el bot está procesando (el agente puede tardar
    // varios segundos en responder).
    expect(sendTelegramTypingActionMock).toHaveBeenCalledWith("bot-token-abc", 999);
  });

  it("no corre el agente cuando otro proceso ya tomó la actualización", async () => {
    handleInboundMessageMock.mockResolvedValue({ duplicate: true });

    await processUpdate("org-1", "bot-token-abc", {
      update_id: 45,
      message: { message_id: 10, date: 1234567890, chat: { id: 999, type: "private" }, text: "Si" }
    });

    expect(runAgentTurnMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("une first_name y last_name en un solo customerName", async () => {
    await processUpdate("org-1", "bot-token-abc", {
      update_id: 45,
      message: {
        message_id: 10,
        date: 1234567890,
        chat: { id: 999, type: "private" },
        from: { id: 999, first_name: "Ferley", last_name: "Gómez" },
        text: "Hola"
      }
    });

    expect(handleInboundMessageMock).toHaveBeenCalledWith(expect.objectContaining({ customerName: "Ferley Gómez" }));
  });

  it("deja customerName sin definir cuando Telegram no envía datos del remitente", async () => {
    await processUpdate("org-1", "bot-token-abc", {
      update_id: 46,
      message: {
        message_id: 11,
        date: 1234567890,
        chat: { id: 999, type: "private" },
        text: "Hola"
      }
    });

    expect(handleInboundMessageMock).toHaveBeenCalledWith(expect.objectContaining({ customerName: undefined }));
  });

  it("omite las actualizaciones sin texto (por ejemplo fotos o stickers) sin tocar el agente", async () => {
    await processUpdate("org-1", "bot-token-abc", {
      update_id: 43,
      message: {
        message_id: 8,
        date: 1234567890,
        chat: { id: 999, type: "private" }
      }
    });

    expect(handleInboundMessageMock).not.toHaveBeenCalled();
    expect(runAgentTurnMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("no envía respuesta cuando el agente está desactivado (la respuesta es null)", async () => {
    runAgentTurnMock.mockResolvedValue({ reply: null, roundsUsed: 0 });

    await processUpdate("org-1", "bot-token-abc", {
      update_id: 44,
      message: {
        message_id: 9,
        date: 1234567890,
        chat: { id: 999, type: "private" },
        text: "hola"
      }
    });

    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendTelegramMessage } from "../src/services/telegram/telegramService.js";

// Reproduce el bug reportado: la respuesta del agente ya queda persistida
// (visible en el Inbox) antes de intentar el envío real a Telegram. Sin
// reintentos, un fallo transitorio (red, 5xx, rate limit) hacía que el
// mensaje se viera "respondido" en el dashboard pero nunca llegara al
// cliente. sendTelegramMessage ahora debe reintentar esos casos.

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, ...init });
}

describe("sendTelegramMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("succeeds on the first try when Telegram responds ok", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, { status: 200 }));

    await expect(sendTelegramMessage("token", 123, "hola")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on a transient network error and eventually succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network hiccup"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, { status: 200 }));

    await expect(sendTelegramMessage("token", 123, "hola")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on a 5xx response instead of giving up immediately", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: false, description: "bad gateway" }, { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, { status: 200 }));

    await expect(sendTelegramMessage("token", 123, "hola")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable 4xx (e.g. bot blocked by the user)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, description: "Forbidden: bot was blocked by the user" }, { status: 403 }));

    await expect(sendTelegramMessage("token", 123, "hola")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries and throws", async () => {
    fetchMock.mockRejectedValue(new Error("persistent network failure"));

    await expect(sendTelegramMessage("token", 123, "hola")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

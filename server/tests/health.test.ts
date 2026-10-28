import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const getTelegramPollerHealthMock = vi.fn();

vi.mock("../src/services/telegram/telegramPollingManager.js", () => ({
  getTelegramPollerHealth: () => getTelegramPollerHealthMock()
}));

const { createApp } = await import("../src/app.js");

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("informa ok cuando todavía no hay bots de Telegram conectados", async () => {
    getTelegramPollerHealthMock.mockReturnValue({ activeOrgCount: 0, lastPollSuccessAt: null });

    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("informa ok cuando un bot conectado consultó hace poco", async () => {
    getTelegramPollerHealthMock.mockReturnValue({ activeOrgCount: 1, lastPollSuccessAt: new Date().toISOString() });

    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("informa degradado (503) cuando un bot conectado lleva más de 2 minutos sin consultar con éxito", async () => {
    const staleTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    getTelegramPollerHealthMock.mockReturnValue({ activeOrgCount: 1, lastPollSuccessAt: staleTimestamp });

    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
  });

  it("informa degradado (503) con el motivo cuando otra instancia consulta el mismo bot", async () => {
    getTelegramPollerHealthMock.mockReturnValue({
      activeOrgCount: 3,
      lastPollSuccessAt: new Date().toISOString(),
      conflictOrgCount: 2
    });

    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.reason).toBe("telegram_poll_conflict_another_instance_running");
  });

  it("informa degradado (503) cuando un bot está conectado pero nunca consultó con éxito", async () => {
    getTelegramPollerHealthMock.mockReturnValue({ activeOrgCount: 1, lastPollSuccessAt: null });

    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
  });
});

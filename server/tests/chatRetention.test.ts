import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { CHAT_RETENTION_DAYS, purgeOldChatHistory } = await import("../src/services/conversations/chatRetentionScheduler.js");

describe("retención de chats", () => {
  beforeEach(() => {
    insforgeMockInstance = createInsforgeMock({}, { purge_old_chat_history: { data: [{ deleted_messages: 3, deleted_conversations: 1 }], error: null } });
  });

  it("pide a la base borrar los chats de más de un año", async () => {
    await purgeOldChatHistory();
    expect(CHAT_RETENTION_DAYS).toBe(365);
    expect(insforgeMockInstance.database.rpc).toHaveBeenCalledWith("purge_old_chat_history", { p_retention_days: 365 });
  });

  it("falla a la vista para que la tarea programada lo registre", async () => {
    insforgeMockInstance = createInsforgeMock({}, { purge_old_chat_history: { data: null, error: { message: "FORBIDDEN" } } });
    await expect(purgeOldChatHistory()).rejects.toMatchObject({ message: "FORBIDDEN" });
  });
});

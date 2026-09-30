import { describe, expect, it } from "vitest";
import { mapHistoryToOpenAiMessages } from "../src/services/agent/agentRuntime.js";
import type { Message } from "../src/types/domain.js";

let seq = 0;
function msg(role: Message["role"], content: string, metadata: Record<string, unknown> = {}): Message {
  seq++;
  return {
    id: `m-${seq}`,
    organization_id: "org-1",
    conversation_id: "conv-1",
    role,
    content,
    metadata,
    created_at: new Date(1_700_000_000_000 + seq * 1000).toISOString()
  } as Message;
}

function toolCall(id: string) {
  return { id, type: "function", function: { name: "consultar_disponibilidad", arguments: "{}" } };
}

describe("mapHistoryToOpenAiMessages", () => {
  it("keeps a well-formed tool call sequence intact", () => {
    const result = mapHistoryToOpenAiMessages([
      msg("user", "hola"),
      msg("assistant", "", { tool_calls: [toolCall("a")] }),
      msg("tool", "{\"ok\":true}", { tool_call_id: "a" }),
      msg("assistant", "Tenemos lugar")
    ]);

    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
  });

  it("repairs the interleaved history left by two concurrent turns (incidente 2026-09-25)", () => {
    // tool_calls A, tool_calls B, resultado A, resultado B: la API rechaza
    // esto con 400 y la conversación quedaba muda hasta salir de la ventana.
    const result = mapHistoryToOpenAiMessages([
      msg("user", "Pagaré en el sitio"),
      msg("assistant", "", { tool_calls: [toolCall("a")] }),
      msg("assistant", "", { tool_calls: [toolCall("b")] }),
      msg("tool", "{\"r\":\"A\"}", { tool_call_id: "a" }),
      msg("tool", "{\"r\":\"B\"}", { tool_call_id: "b" }),
      msg("user", "Puedes cancelar")
    ]);

    // Cada assistant con tool_calls queda seguido exactamente por sus resultados.
    for (let i = 0; i < result.length; i++) {
      const m = result[i];
      if (m.role === "assistant" && "tool_calls" in m && m.tool_calls?.length) {
        const ids = m.tool_calls.map((tc) => tc.id);
        const next = result.slice(i + 1, i + 1 + ids.length);
        expect(next.map((n) => (n.role === "tool" ? n.tool_call_id : null))).toEqual(ids);
      }
      if (m.role === "tool") {
        const prev = result[i - 1];
        expect(prev.role === "tool" || (prev.role === "assistant" && "tool_calls" in prev)).toBe(true);
      }
    }
    expect(result[result.length - 1]).toEqual({ role: "user", content: "Puedes cancelar" });
  });

  it("drops orphan tool results cut off by the history window", () => {
    const result = mapHistoryToOpenAiMessages([
      msg("tool", "{\"ok\":true}", { tool_call_id: "fuera-de-ventana" }),
      msg("assistant", "Listo, reservado"),
      msg("user", "gracias")
    ]);

    expect(result.map((m) => m.role)).toEqual(["assistant", "user"]);
  });

  it("degrades a tool call without its results to plain text, or drops it if empty", () => {
    const result = mapHistoryToOpenAiMessages([
      msg("assistant", "Déjame revisar", { tool_calls: [toolCall("x")] }),
      msg("assistant", "", { tool_calls: [toolCall("y")] }),
      msg("user", "?")
    ]);

    expect(result).toEqual([
      { role: "assistant", content: "Déjame revisar" },
      { role: "user", content: "?" }
    ]);
  });
});

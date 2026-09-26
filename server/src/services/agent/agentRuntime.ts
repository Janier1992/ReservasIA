import type OpenAI from "openai";
import { openai, OPENAI_MODEL, IS_OPENROUTER } from "../../lib/openai.js";
import { insforgeAdmin } from "../../lib/insforge.js";
import { logAgentEvent, logger } from "../../lib/logger.js";
import { AGENT_TIMEOUT_MS, MAX_CONVERSATION_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH } from "../../config/env.js";
import { buildSystemPrompt, loadAgentPromptData } from "./promptBuilder.js";
import { getToolDefinitionsForAgent } from "./tools.js";
import { executeTool, type AgentExecutionContext } from "./toolExecutors.js";
import { MAX_TOOL_ROUNDS } from "./coreRules.js";
import type { Message } from "../../types/domain.js";

const FALLBACK_REPLY =
  "Disculpá, tuve un inconveniente para procesar tu mensaje. Un miembro del equipo del negocio te va a responder en breve.";

// El modelo gratuito de OpenRouter rota entre varios proveedores upstream
// (más variedad todavía desde que se prioriza "throughput"), y se observó
// que alguno de ellos filtra su propio token interno de "fin de turno"
// (p. ej. "<CPA_DONE>") directamente en el texto visible en vez de
// recortarlo del lado del servidor. `stop` corta la generación ahí cuando
// el proveedor sí lo respeta; el regex de abajo es la red de seguridad para
// cuando no lo hace (o filtra un tag equivalente que todavía no vimos).
const KNOWN_LEAKED_CONTROL_TOKENS = ["<CPA_DONE>"];

function stripLeakedControlTokens(text: string): string {
  return text.replace(/<\/?[A-Z][A-Z0-9_]*>/g, "").trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), ms))
  ]);
}

async function persistMessage(input: {
  organizationId: string;
  conversationId: string;
  role: Message["role"];
  content: string;
  metadata?: Record<string, unknown>;
}) {
  await insforgeAdmin.database.from("messages").insert([
    {
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {}
    }
  ]);
}

/**
 * La API exige que cada mensaje de assistant con `tool_calls` vaya seguido
 * INMEDIATAMENTE por un mensaje `tool` por cada tool_call_id, y rechaza con
 * 400 cualquier otra secuencia. El historial guardado no siempre cumple eso:
 * - dos turnos simultáneos sobre la misma conversación (incidente
 *   2026-09-25) dejan las filas intercaladas: tool_calls A, tool_calls B,
 *   resultado A, resultado B;
 * - la ventana de MAX_CONVERSATION_HISTORY_MESSAGES puede cortar justo
 *   entre un tool_calls y sus resultados, dejando resultados huérfanos.
 * Si se manda tal cual, TODOS los turnos siguientes de esa conversación
 * fallan (el cliente solo recibe el mensaje de "tuve un inconveniente")
 * hasta que lo roto sale de la ventana. Por eso se reconstruye una
 * secuencia válida: un tool_calls sin todas sus respuestas contiguas se
 * degrada a texto (o se descarta si no tiene texto), y los resultados
 * huérfanos se descartan.
 */
export function mapHistoryToOpenAiMessages(rows: Message[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i];

    if (row.role === "user") {
      messages.push({ role: "user", content: row.content });
      i++;
      continue;
    }

    if (row.role === "assistant" || row.role === "staff") {
      const toolCalls = row.metadata?.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined;

      if (toolCalls && toolCalls.length > 0) {
        let j = i + 1;
        const responses = new Map<string, string>();
        while (j < rows.length && rows[j].role === "tool") {
          const toolCallId = rows[j].metadata?.tool_call_id as string | undefined;
          if (toolCallId) responses.set(toolCallId, rows[j].content);
          j++;
        }

        if (toolCalls.every((tc) => responses.has(tc.id))) {
          messages.push({ role: "assistant", content: row.content || null, tool_calls: toolCalls });
          for (const tc of toolCalls) {
            messages.push({ role: "tool", tool_call_id: tc.id, content: responses.get(tc.id)! });
          }
        } else if (row.content) {
          messages.push({ role: "assistant", content: row.content });
        }
        i = j;
        continue;
      }

      if (row.content) messages.push({ role: "assistant", content: row.content });
      i++;
      continue;
    }

    // Resultado de herramienta huérfano (su tool_calls no quedó justo
    // antes) u otro rol: se descarta.
    i++;
  }

  return messages;
}

export interface RunAgentTurnParams {
  organizationId: string;
  conversationId: string;
  customerId: string | null;
  customerPhone: string;
  requestId?: string;
  previewMode?: boolean;
}

export interface RunAgentTurnResult {
  reply: string | null;
  roundsUsed: number;
}

/**
 * Ejecuta un turno completo del agente: recupera contexto, arma el prompt,
 * y corre el loop de tool-calling multi-ronda (punto 24 del prompt). Asume
 * que el mensaje del usuario YA fue persistido por el llamador antes de
 * invocar esta función (para que quede en el historial que se recupera acá).
 */
async function runAgentTurnInternal(params: RunAgentTurnParams): Promise<RunAgentTurnResult> {
  const { organizationId, conversationId, customerId, customerPhone, requestId, previewMode } = params;
  const logCtx = { organizationId, conversationId, requestId };

  const data = await loadAgentPromptData(organizationId, customerId);
  if (data.organization.status !== "active") {
    logAgentEvent(logCtx, { scope: "agent", result: "success", message: "organization_not_active_skipping" });
    return { reply: null, roundsUsed: 0 };
  }
  if (!data.agentConfig.enabled) {
    logAgentEvent(logCtx, { scope: "agent", result: "success", message: "agent_disabled_skipping" });
    return { reply: null, roundsUsed: 0 };
  }

  const { data: historyRows, error: historyError } = await insforgeAdmin.database
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_CONVERSATION_HISTORY_MESSAGES);

  if (historyError) {
    logAgentEvent(logCtx, { scope: "agent", result: "error", message: "history_load_failed" });
    return { reply: FALLBACK_REPLY, roundsUsed: 0 };
  }

  const orderedHistory = ((historyRows ?? []) as Message[]).slice().reverse();
  const systemPrompt = buildSystemPrompt(data, new Date());
  const tools = getToolDefinitionsForAgent(data.agentConfig, {
    previewMode,
    hasServices: data.services.length > 0,
    hasResources: data.resources.length > 0
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...mapHistoryToOpenAiMessages(orderedHistory)
  ];

  const executionCtx: AgentExecutionContext = {
    organizationId,
    conversationId,
    timezone: data.organization.timezone,
    customerPhone,
    customerId
  };

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    const start = Date.now();
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      const requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: OPENAI_MODEL,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        temperature: 0.4,
        stop: KNOWN_LEAKED_CONTROL_TOKENS
      };
      if (IS_OPENROUTER) {
        // Campo específico de OpenRouter, no tipado por el SDK de OpenAI.
        (requestBody as unknown as { provider: { sort: string } }).provider = { sort: "throughput" };
      }

      completion = await withTimeout(openai.chat.completions.create(requestBody), AGENT_TIMEOUT_MS, "openai_completion");
    } catch (err) {
      logAgentEvent(logCtx, { scope: "agent", result: "error", durationMs: Date.now() - start, message: "openai_call_failed" });
      logger.error({ ...logCtx, err }, "agent_openai_error");
      return { reply: FALLBACK_REPLY, roundsUsed: round };
    }

    const choice = completion.choices[0];
    const responseMessage = choice.message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: responseMessage.content,
        tool_calls: responseMessage.tool_calls
      });
      await persistMessage({
        organizationId,
        conversationId,
        role: "assistant",
        content: stripLeakedControlTokens(responseMessage.content ?? ""),
        metadata: { tool_calls: responseMessage.tool_calls }
      });

      // Las herramientas de una misma ronda son independientes entre sí (el
      // modelo ya decidió pedirlas juntas), así que se ejecutan en paralelo
      // en vez de una por una — evita que varias llamadas a la BD/Google
      // Calendar se sumen secuencialmente a la latencia del turno.
      const toolRunResults = await Promise.all(
        responseMessage.tool_calls.map(async (toolCall) => {
          const toolStart = Date.now();
          let parsedArgs: unknown = {};
          try {
            parsedArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
          } catch {
            parsedArgs = {};
          }

          const result = await executeTool(toolCall.function.name, parsedArgs, executionCtx);

          logAgentEvent(logCtx, {
            scope: "agent",
            tool: toolCall.function.name,
            durationMs: Date.now() - toolStart,
            result: result.success ? "success" : "error"
          });

          return { toolCall, result };
        })
      );

      for (const { toolCall, result } of toolRunResults) {
        const toolContent = JSON.stringify(result);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: toolContent });
        await persistMessage({
          organizationId,
          conversationId,
          role: "tool",
          content: toolContent,
          metadata: { tool_call_id: toolCall.id, name: toolCall.function.name }
        });
      }

      continue;
    }

    const finalReply = stripLeakedControlTokens(responseMessage.content ?? "").slice(0, MAX_MESSAGE_LENGTH);
    await persistMessage({ organizationId, conversationId, role: "assistant", content: finalReply });
    logAgentEvent(logCtx, { scope: "agent", result: "success", durationMs: Date.now() - start, message: "final_reply" });
    return { reply: finalReply, roundsUsed: round };
  }

  logAgentEvent(logCtx, { scope: "agent", result: "error", message: "max_tool_rounds_exceeded" });
  await persistMessage({ organizationId, conversationId, role: "assistant", content: FALLBACK_REPLY });
  return { reply: FALLBACK_REPLY, roundsUsed: MAX_TOOL_ROUNDS };
}

// El webhook de Twilio dispara el turno del agente en segundo plano sin
// esperarlo (para responderle a Twilio en <15s), así que si el cliente manda
// dos mensajes seguidos por WhatsApp se pueden disparar dos turnos en
// paralelo para la misma conversación: ambos cargan el historial antes de
// que el primero guarde su respuesta, y el que responda más rápido le llega
// al cliente primero, generando respuestas fuera de orden y sin contexto
// entre sí. Esta cola por conversationId obliga a que un turno termine (y
// persista su respuesta) antes de que arranque el siguiente para la misma
// conversación, sin bloquear turnos de otras conversaciones.
const conversationLocks = new Map<string, Promise<void>>();

export function runAgentTurn(params: RunAgentTurnParams): Promise<RunAgentTurnResult> {
  const previous = conversationLocks.get(params.conversationId) ?? Promise.resolve();
  const result = previous.then(() => runAgentTurnInternal(params));

  const lock = result.then(
    () => undefined,
    () => undefined
  );
  conversationLocks.set(params.conversationId, lock);
  lock.then(() => {
    if (conversationLocks.get(params.conversationId) === lock) {
      conversationLocks.delete(params.conversationId);
    }
  });

  return result;
}

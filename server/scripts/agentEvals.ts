// Batería de pruebas del agente con el modelo REAL (no con un doble): manda
// cada escenario de scripts/agentEvalScenarios.ts al modelo con las mismas
// instrucciones, herramientas y "creatividad" que en producción, y revisa la
// respuesta. Las herramientas responden con datos de prueba calculados del
// negocio de ejemplo (nunca tocan la base).
//
// Una respuesta pasa si:
//   - la revisión automática (responseVerifier.ts) no encuentra días, horas
//     ni precios que no sean del negocio. Se mide la respuesta ORIGINAL del
//     modelo, antes de cualquier corrección: es lo que dice cuánto alucina;
//   - incluye todo lo que el escenario exige y nada de lo que prohíbe.
//
// Uso (cuesta centavos: ~25 llamadas a gpt-4o-mini por corrida):
//   OPENAI_API_KEY=... OPENAI_BASE_URL=https://openrouter.ai/api/v1 \
//   OPENAI_MODEL=openai/gpt-4o-mini npx tsx scripts/agentEvals.ts
// Variables opcionales: EVAL_RUNS (repeticiones por escenario, 1 por defecto)
// y EVAL_ONLY (solo los escenarios cuyo id contiene ese texto).
// En GitHub: Actions → "Pruebas del agente con el modelo real" → Run workflow.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";
import { fromZonedTime } from "date-fns-tz";
import { buildSystemPrompt, type AgentPromptData } from "../src/services/agent/systemPrompt.js";
import { getToolDefinitionsForAgent } from "../src/services/agent/tools.js";
import { AGENT_TEMPERATURE, MAX_TOOL_ROUNDS } from "../src/services/agent/coreRules.js";
import { verifyAgentReply, type ReplyIssue } from "../src/services/agent/responseVerifier.js";
import { blocksOnDay, businessRanges, formatClock, localDate, localMoment } from "../src/services/agent/scheduleText.js";
import { scenarios, THURSDAY_NIGHT, type EvalScenario } from "./agentEvalScenarios.js";

type ChatClient = Pick<OpenAI, "chat">;
type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface EvalResult {
  id: string;
  passed: boolean;
  reply: string;
  issues: ReplyIssue[];
  missing: string[];
  forbidden: string[];
  tools: string[];
  error?: string;
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cupos de prueba: cada hora del horario del día pedido (sin festivos ni horas ya pasadas). */
export function stubAvailability(data: AgentPromptData, args: { fecha?: string; hora_preferida?: string }, now: Date) {
  const timezone = data.organization.timezone;
  const fecha = args.fecha ?? localDate(now, timezone, 0);
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const closed = blocksOnDay(data.blocks, fecha, timezone).some((b) => b.wholeDay);
  const slots: { fecha: string; hora: string; cuando: string; hasta: string; start: number }[] = [];
  for (const range of closed ? [] : businessRanges(data.hours, dow)) {
    for (let h = Number(range.open.slice(0, 2)); h + 1 <= Number(range.close.slice(0, 2)); h++) {
      const hora = `${String(h).padStart(2, "0")}:00`;
      const start = fromZonedTime(`${fecha}T${hora}:00`, timezone);
      if (start <= now) continue;
      const moment = localMoment(start.toISOString(), timezone);
      slots.push({ ...moment, hasta: formatClock(`${h + 1}:00`), start: start.getTime() });
    }
  }
  const target = args.hora_preferida ? fromZonedTime(`${fecha}T${args.hora_preferida}:00`, timezone).getTime() : 0;
  const sorted = args.hora_preferida ? slots.sort((a, b) => Math.abs(a.start - target) - Math.abs(b.start - target)) : slots;
  const top = sorted.slice(0, 8).map(({ start: _start, ...slot }) => slot);
  return {
    available: top.length > 0,
    slots: top,
    reason: top.length === 0 ? (closed ? "El negocio no atiende ese día (festivo)." : "Sin cupos disponibles ese día.") : undefined,
    zona_horaria: timezone
  };
}

/** Respuesta de prueba de cada herramienta, con la misma forma que la real. */
function runStubTool(name: string, rawArgs: string, data: AgentPromptData, now: Date): unknown {
  let args: Record<string, string> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    // argumentos inválidos: se responde como si no hubiera
  }
  switch (name) {
    case "consultar_disponibilidad":
      return { success: true, data: stubAvailability(data, args, now) };
    case "consultar_servicios":
      return {
        success: true,
        data: data.services.map(({ id, name: serviceName, description, duration_minutes, price, currency }) => ({ id, name: serviceName, description, duration_minutes, price, currency }))
      };
    case "obtener_info_negocio":
      return { success: true, data: data.businessProfile };
    case "consultar_reservas_cliente":
      return { success: true, data: [] };
    case "crear_reserva":
      return { success: true, data: { id: "reserva-de-prueba", status: "confirmed", ...localMoment(now.toISOString(), data.organization.timezone) } };
    default:
      return { success: false, error_code: "RESERVATION_NOT_FOUND", message: "La reserva no existe." };
  }
}

/** Corre un escenario completo (con sus llamadas a herramientas) y revisa la respuesta. */
export async function runScenario(client: ChatClient, model: string, scenario: EvalScenario): Promise<EvalResult> {
  const now = scenario.now ?? THURSDAY_NIGHT;
  const data = scenario.business;
  const tools = getToolDefinitionsForAgent(data.agentConfig, { hasServices: data.services.length > 0, hasResources: data.resources.length > 0 });
  const messages: Message[] = [{ role: "system", content: buildSystemPrompt(data, now) }, ...scenario.conversation];
  const toolOutputs: string[] = [];
  const usedTools: string[] = [];
  const base = { id: scenario.id, issues: [], missing: [], forbidden: [], tools: usedTools };

  try {
    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: AGENT_TEMPERATURE
      };
      const completion = await client.chat.completions.create(body);
      const message = completion.choices[0]?.message;
      if (message?.tool_calls?.length) {
        messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });
        for (const call of message.tool_calls) {
          usedTools.push(call.function.name);
          const output = JSON.stringify(runStubTool(call.function.name, call.function.arguments, data, now));
          toolOutputs.push(output);
          messages.push({ role: "tool", tool_call_id: call.id, content: output });
        }
        continue;
      }
      const reply = message?.content ?? "";
      const text = normalize(reply);
      const issues = verifyAgentReply(reply, data, now, toolOutputs);
      const missing = (scenario.mustInclude ?? []).filter((re) => !re.test(text)).map(String);
      const forbidden = (scenario.mustNotInclude ?? []).filter((re) => re.test(text)).map(String);
      return { ...base, reply, issues, missing, forbidden, passed: reply.trim() !== "" && issues.length + missing.length + forbidden.length === 0 };
    }
    return { ...base, passed: false, reply: "", error: "superó el máximo de rondas de herramientas" };
  } catch (err) {
    return { ...base, passed: false, reply: "", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Corre todos los escenarios, de a pocos en paralelo. */
export async function runAll(client: ChatClient, model: string, list: EvalScenario[], runs = 1, concurrency = 4): Promise<EvalResult[]> {
  const queue = list.flatMap((s) => Array.from({ length: runs }, () => s));
  const results: EvalResult[] = new Array(queue.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (next < queue.length) {
        const index = next++;
        results[index] = await runScenario(client, model, queue[index]);
      }
    })
  );
  return results;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 300);

/** Informe en Markdown: resumen arriba y, por cada falla, la respuesta y el motivo. */
export function formatReport(results: EvalResult[], model: string): string {
  const passed = results.filter((r) => r.passed).length;
  const lines = [`## Pruebas del agente con el modelo real`, "", `Modelo: \`${model}\` — **${passed}/${results.length}** respuestas correctas.`, ""];
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push("| Escenario | Problema | Respuesta |", "|---|---|---|");
    for (const r of failed) {
      const problems = [
        ...r.issues.map((i) => i.detail),
        ...r.missing.map((m) => `falta ${m}`),
        ...r.forbidden.map((f) => `no debería decir ${f}`),
        ...(r.error ? [`error: ${r.error}`] : [])
      ];
      lines.push(`| ${r.id} | ${cell(problems.join("; "))} | ${cell(r.reply)} |`);
    }
    lines.push("");
  }
  lines.push("<details><summary>Todas las respuestas</summary>", "");
  for (const r of results) lines.push(`- ${r.passed ? "✅" : "❌"} **${r.id}**${r.tools.length ? ` (herramientas: ${r.tools.join(", ")})` : ""}: ${cell(r.reply)}`);
  lines.push("", "</details>");
  return lines.join("\n");
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Falta OPENAI_API_KEY (la key de OpenRouter u OpenAI).");
    process.exit(2);
  }
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  const model = process.env.OPENAI_MODEL || (baseURL?.includes("openrouter.ai") ? "openai/gpt-4o-mini" : "gpt-4o-mini");
  const runs = Math.max(1, Number(process.env.EVAL_RUNS ?? 1) || 1);
  const only = process.env.EVAL_ONLY?.trim();
  const list = only ? scenarios.filter((s) => s.id.includes(only)) : scenarios;

  const client = new OpenAI({ apiKey, baseURL, maxRetries: 2 });
  const results = await runAll(client, model, list, runs);
  const report = formatReport(results, model);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

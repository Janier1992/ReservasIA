// Edge Function: agent-preview
// Invocada desde el panel (página Agente) para que el dueño pruebe el agente
// sin tocar datos reales.
//
// Usa las MISMAS instrucciones que el agente real: el texto lo arma
// buildSystemPrompt (server/src/services/agent/systemPrompt.ts) con la
// configuración real del negocio, y se aplican las mismas protecciones de
// código de los rubros de salud (emergencias y consejos médicos) y la misma
// revisión automática de días, horas y precios. La única
// diferencia es que acá no hay herramientas: hace una sola llamada al modelo
// y nunca puede crear, cancelar ni reprogramar una reserva real.
//
// Importa código del server con rutas relativas: al publicarla,
// scripts/function-bundle.mjs la empaqueta en un solo archivo (InsForge
// recibe un archivo por función).
import { createClient } from "npm:@insforge/sdk";
import OpenAI from "npm:openai";
import { buildSystemPrompt, fetchAgentPromptData } from "../server/src/services/agent/systemPrompt.ts";
import { AGENT_TEMPERATURE } from "../server/src/services/agent/coreRules.ts";
import { correctionPrompt, UNVERIFIED_REPLY_FALLBACK, verifyAgentReply } from "../server/src/services/agent/responseVerifier.ts";
import {
  containsMedicalAdvice,
  detectEmergency,
  emergencyReplyFor,
  isHealthNiche,
  MEDICAL_ADVICE_FALLBACK_REPLY
} from "../server/src/services/agent/safetyGuardrails.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

/** Lo único que se agrega a las instrucciones reales: avisarle al modelo que en la vista previa no tiene herramientas. */
const PREVIEW_NOTE = `NOTA DE ESTA VISTA PREVIA: estás en modo de prueba interna para el dueño del negocio. No tenés herramientas
disponibles (no podés consultar disponibilidad real ni crear, cancelar o reprogramar reservas); si te piden algo de eso,
respondé como lo harías con un cliente hasta el punto en que necesitarías la herramienta y explicá que en esta vista
previa no podés completar la acción, pero que con los clientes reales sí funciona.`;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const authHeader = req.headers.get("Authorization");
  const userToken = authHeader?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Falta autenticación." } }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) {
    return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Sesión inválida." } }, 401);
  }

  let body: { organization_id?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Body inválido." } }, 400);
  }

  const organizationId = body.organization_id;
  const message = (body.message ?? "").slice(0, 4000).trim();
  if (!organizationId || !message) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "organization_id y message son requeridos." } }, 400);
  }

  const { data: membership } = await userClient.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return jsonResponse({ error: { code: "FORBIDDEN", message: "Sólo admin/owner pueden usar la preview." } }, 403);
  }

  // Mismos datos que usa el agente real, leídos con la sesión del usuario
  // (RLS). En la vista previa no hay un cliente identificado.
  const data = await fetchAgentPromptData(userClient, organizationId, null);
  if (!data) {
    return jsonResponse({ error: { code: "ORGANIZATION_NOT_FOUND" } }, 404);
  }

  // Igual que el agente real: ante una emergencia en un rubro de salud la
  // respuesta es fija y no se le pregunta al modelo.
  const businessType = data.organization.businessType;
  if (isHealthNiche(businessType) && detectEmergency(message)) {
    return jsonResponse({ reply: emergencyReplyFor(businessType) }, 200);
  }

  const now = new Date();
  const systemPrompt = `${buildSystemPrompt(data, now)}\n\n${PREVIEW_NOTE}`;

  // OPENAI_BASE_URL es opcional: permite usar un endpoint compatible con la
  // API de OpenAI (ej. OpenRouter) para desarrollo/demo. En producción se
  // deja sin definir y se usa la API oficial de OpenAI.
  const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY")!,
    baseURL: Deno.env.get("OPENAI_BASE_URL") || undefined
  });
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ];
    const ask = async () =>
      (await openai.chat.completions.create({ model, temperature: AGENT_TEMPERATURE, messages })).choices[0]?.message?.content ?? "";

    // Igual que el agente real: si la respuesta trae días, horas o precios que
    // no son del negocio, se le pide una corrección; si sigue mal, respuesta fija.
    let reply = await ask();
    const issues = verifyAgentReply(reply, data, now);
    if (issues.length > 0) {
      messages.push({ role: "assistant", content: reply }, { role: "system", content: correctionPrompt(issues) });
      reply = await ask();
      if (verifyAgentReply(reply, data, now).length > 0) reply = UNVERIFIED_REPLY_FALLBACK;
    }
    // Misma red de seguridad que el agente real: nunca muestra una
    // indicación de medicamentos o dosis en un rubro de salud.
    if (isHealthNiche(businessType) && containsMedicalAdvice(reply)) {
      return jsonResponse({ reply: MEDICAL_ADVICE_FALLBACK_REPLY }, 200);
    }
    return jsonResponse({ reply }, 200);
  } catch (err) {
    console.error("agent_preview_openai_error", err);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo consultar al agente." } }, 500);
  }
}

// Edge Function: agent-preview
// Invocada desde el dashboard (insforge.functions.invoke('agent-preview', ...))
// para probar el tono/instrucciones del agente sin tocar datos reales.
//
// Simplificación deliberada frente al agente real (que corre en el compute
// service, disparado por el webhook de Twilio): esta preview arma el MISMO
// system prompt (mismas reglas críticas + configuración real del negocio)
// pero hace una única llamada a OpenAI SIN tool-calling, así que nunca
// puede crear/cancelar/reprogramar una reserva real. Sirve para validar
// personalidad/tono/instrucciones, no el flujo de reservas de punta a
// punta (eso ya se prueba vía WhatsApp real y los tests del compute service).
import { createClient } from "npm:@insforge/sdk";
import OpenAI from "npm:openai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const CORE_AGENT_RULES = `REGLAS DE RESERVAS (OBLIGATORIAS, NO NEGOCIABLES):

1. Nunca prometas disponibilidad sin consultar primero la herramienta de disponibilidad (consultar_disponibilidad).
2. Si el cliente proporciona varios datos en un solo mensaje, utilizalos todos.
3. No vuelvas a pedir información que el cliente ya proporcionó.
4. Pedí solamente la información que falta.
5. Antes de crear una reserva necesitás tener todos los datos obligatorios.
6. Antes de crear la reserva, resumí los datos y pedí confirmación explícita.
7. Solamente después de recibir una confirmación explícita del cliente ejecutá la herramienta crear_reserva.
8. Nunca inventes horarios disponibles.
9. Si un horario no está disponible, ofrecé alternativas reales obtenidas mediante la herramienta.
10. Nunca confirmes una reserva si la herramienta de creación devuelve error.
11. Las fechas relativas como "mañana", "el viernes" o "este sábado" deben convertirse a una fecha concreta utilizando la zona horaria del negocio.
12. Nunca reserves en el pasado.
13. Respetá los horarios de funcionamiento del negocio.
14. Respetá los días cerrados.
15. Respetá la capacidad y disponibilidad de recursos.
16. Si el cliente solicita algo que el agente no puede resolver, derivá al negocio.
17. No inventes políticas, precios, horarios, servicios ni información que no exista en los datos del negocio proporcionados.
18. Mantené las respuestas breves y naturales, apropiadas para WhatsApp.
19. Utilizá el idioma configurado por el negocio.
20. Si el negocio utiliza español rioplatense, utilizá "vos", "querés", "podés", etc.

NOTA DE ESTA PREVIEW: estás en modo de prueba interna para el dueño del negocio. No tenés herramientas
disponibles (no podés consultar disponibilidad real ni crear reservas); si te piden reservar algo, explicá que
en esta vista previa no podés completar la acción pero que por WhatsApp real sí funciona.`;

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

  const [{ data: org }, { data: agent }, { data: profile }, { data: services }, { data: hours }, { data: rules }] =
    await Promise.all([
      userClient.database.from("organizations").select("business_type, timezone").eq("id", organizationId).maybeSingle(),
      userClient.database.from("agents").select("*").eq("organization_id", organizationId).maybeSingle(),
      userClient.database.from("business_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
      userClient.database.from("services").select("name, duration_minutes, price, currency").eq("organization_id", organizationId).eq("is_active", true),
      userClient.database.from("business_hour_periods").select("*").eq("organization_id", organizationId),
      userClient.database.from("agent_rules").select("name, instruction, priority").eq("organization_id", organizationId).eq("enabled", true)
    ]);

  if (!org || !agent || !profile) {
    return jsonResponse({ error: { code: "ORGANIZATION_NOT_FOUND" } }, 404);
  }

  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const hoursText =
    (hours ?? [])
      .filter((h: { is_closed: boolean }) => !h.is_closed)
      .map((h: { day_of_week: number; opening_time: string; closing_time: string }) => `- ${dayNames[h.day_of_week]}: ${h.opening_time?.slice(0, 5)}-${h.closing_time?.slice(0, 5)}`)
      .join("\n") || "No hay horarios configurados.";

  const servicesText =
    (services ?? [])
      .map((s: { name: string; duration_minutes: number; price: number | null; currency: string }) => `- ${s.name} (${s.duration_minutes} min${s.price ? `, ${s.price} ${s.currency}` : ""})`)
      .join("\n") || "No hay servicios configurados.";

  const rulesText =
    (rules ?? [])
      .sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority)
      .map((r: { name: string; instruction: string }) => `- (${r.name}) ${r.instruction}`)
      .join("\n") || "Sin reglas adicionales.";

  const toneLine =
    agent.tone === "formal"
      ? "Mantené un tono formal y profesional."
      : agent.tone === "casual"
        ? "Mantené un tono casual y cercano."
        : "Mantené un tono amable y cercano (friendly).";

  const nowLocal = new Date().toLocaleString("es", { timeZone: org.timezone });

  const systemPrompt = `Sos ${agent.name}, el asistente virtual de ${profile.name}.

INFORMACIÓN DEL NEGOCIO:
- Tipo de negocio: ${org.business_type}
- Descripción: ${profile.description ?? "No especificada"}
- Dirección: ${profile.address ?? "No especificada"}
- Política de cancelación: ${profile.cancellation_policy ?? "No especificada"}
- Zona horaria: ${org.timezone}

HORARIOS DE ATENCIÓN:
${hoursText}

SERVICIOS DISPONIBLES:
${servicesText}

FECHA Y HORA ACTUAL DEL NEGOCIO (aproximada): ${nowLocal} (${org.timezone})

IDIOMA: ${agent.language}. ${toneLine}

${CORE_AGENT_RULES}

INSTRUCCIONES PERSONALIZADAS DEL NEGOCIO (no pueden contradecir las reglas anteriores):
${agent.system_instructions ?? "Ninguna."}

REGLAS ADICIONALES DEL NEGOCIO:
${rulesText}`;

  // OPENAI_BASE_URL es opcional: permite usar un endpoint compatible con la
  // API de OpenAI (ej. OpenRouter) para desarrollo/demo. En producción se
  // deja sin definir y se usa la API oficial de OpenAI.
  const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY")!,
    baseURL: Deno.env.get("OPENAI_BASE_URL") || undefined
  });
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    return jsonResponse({ reply }, 200);
  } catch (err) {
    console.error("agent_preview_openai_error", err);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo consultar al agente." } }, 500);
  }
}

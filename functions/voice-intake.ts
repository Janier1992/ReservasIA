// Edge Function: voice-intake
// "Atención en sitio" por voz: el navegador transcribe lo que dice el equipo
// ("llegó Carlos Ruiz, 300 123 4567, lavado general, placa ABC123") y esta
// función le pide a Gemini que lo convierta en los campos del formulario.
// Devuelve solo datos estructurados; el registro lo hace el panel con los
// permisos del usuario (RLS), así que esta función no escribe nada.
//
// Secretos de InsForge: GEMINI_API_KEY (obligatorio), GEMINI_MODEL (opcional).
// La clave de Gemini nunca llega al navegador.
import { createClient } from "npm:@insforge/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const MAX_TRANSCRIPT_LENGTH = 1000;
const DEFAULT_MODEL = "gemini-2.5-flash";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

interface Extracted {
  customer_name: string | null;
  phone: string | null;
  service_id: string | null;
  party_size: number | null;
  notes: string | null;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    customer_name: { type: "STRING", nullable: true },
    phone: { type: "STRING", nullable: true },
    service_id: { type: "STRING", nullable: true },
    party_size: { type: "INTEGER", nullable: true },
    notes: { type: "STRING", nullable: true }
  },
  required: ["customer_name", "phone", "service_id", "party_size", "notes"]
};

function buildPrompt(transcript: string, businessType: string, services: { id: string; name: string }[]) {
  const catalog = services.length > 0 ? services.map((s) => `- ${s.id}: ${s.name}`).join("\n") : "(el negocio no tiene servicios cargados)";
  return `Sos el asistente de recepción de un negocio (rubro: ${businessType}). Alguien del equipo dictó en voz alta los datos de un cliente que acaba de llegar para ser atendido en el lugar. Extraé los datos para el formulario de llegada.

Reglas:
- customer_name: nombre y apellido tal como se dijeron, con mayúscula inicial. null si no se dijo.
- phone: solo dígitos (y "+" inicial si se dijo un indicativo). Los números dictados en palabras pasalos a dígitos ("tres cero cero" = 300). null si no se dijo.
- service_id: el id EXACTO del servicio del catálogo que mejor coincida con lo dicho; null si no se mencionó ninguno o no hay coincidencia clara. Nunca inventes ids.
- party_size: cantidad de personas si se dijo (ej. "mesa para cuatro" = 4); null si no.
- notes: cualquier otro dato útil (placa del vehículo en mayúsculas sin espacios, mascota, pedido especial, preferencia). null si no hay.
- No inventes datos que no estén en el texto.

Catálogo de servicios (id: nombre):
${catalog}

Texto dictado:
"""${transcript}"""`;
}

function sanitize(raw: Partial<Extracted>, serviceIds: Set<string>): Extracted {
  const name = typeof raw.customer_name === "string" ? raw.customer_name.trim().slice(0, 80) : "";
  const phoneDigits = typeof raw.phone === "string" ? raw.phone.replace(/[^\d+]/g, "") : "";
  const digitCount = phoneDigits.replace(/\D/g, "").length;
  const party = typeof raw.party_size === "number" && Number.isInteger(raw.party_size) ? raw.party_size : null;
  const notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, 300) : "";
  return {
    customer_name: name || null,
    phone: digitCount >= 7 && digitCount <= 15 ? phoneDigits : null,
    service_id: typeof raw.service_id === "string" && serviceIds.has(raw.service_id) ? raw.service_id : null,
    party_size: party !== null && party >= 1 && party <= 200 ? party : null,
    notes: notes || null
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Método no permitido.", 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return errorResponse("VOICE_NOT_CONFIGURED", "El registro por voz no está configurado (falta GEMINI_API_KEY en InsForge).", 503);
  }

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!userToken) return errorResponse("UNAUTHENTICATED", "Sesión requerida.", 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) return errorResponse("UNAUTHENTICATED", "Sesión requerida.", 401);

  let body: { organization_id?: string; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Cuerpo inválido.", 400);
  }
  const organizationId = body.organization_id;
  const transcript = (body.transcript ?? "").trim().slice(0, MAX_TRANSCRIPT_LENGTH);
  if (!organizationId || !transcript) {
    return errorResponse("VALIDATION_ERROR", "organization_id y transcript son requeridos.", 400);
  }

  // RLS: solo un miembro del negocio ve su organización y sus servicios.
  const { data: org } = await userClient.database
    .from("organizations")
    .select("id, business_type")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return errorResponse("NOT_A_MEMBER", "No perteneces a este negocio.", 403);

  const { data: servicesData } = await userClient.database
    .from("services")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  const services = (servicesData ?? []) as { id: string; name: string }[];

  const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL;
  let geminiRes: Response;
  try {
    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(transcript, org.business_type ?? "other", services) }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA }
      }),
      signal: AbortSignal.timeout(20_000)
    });
  } catch (err) {
    console.error("voice_intake_gemini_unreachable", err);
    return errorResponse("VOICE_UNAVAILABLE", "No se pudo contactar a Gemini. Intentá de nuevo.", 502);
  }

  if (!geminiRes.ok) {
    console.error("voice_intake_gemini_error", geminiRes.status, await geminiRes.text().catch(() => ""));
    return errorResponse("VOICE_UNAVAILABLE", "Gemini no pudo procesar el dictado. Intentá de nuevo.", 502);
  }

  const payload = await geminiRes.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  let raw: Partial<Extracted> = {};
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    console.error("voice_intake_bad_json", text);
    return errorResponse("VOICE_UNAVAILABLE", "No se entendió la respuesta de Gemini. Intentá de nuevo.", 502);
  }

  return jsonResponse({ fields: sanitize(raw, new Set(services.map((s) => s.id))), transcript }, 200);
}

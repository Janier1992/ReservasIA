// Edge Function: ycloud-connect
// Conecta el WhatsApp del negocio por YCloud (socio oficial de Meta), en modo
// coexistencia: el negocio sigue usando su app de WhatsApp Business y el
// agente atiende por la API con el mismo número. Valida la API key contra
// YCloud, elige el número de la cuenta y registra en YCloud el webhook que
// le manda al compute service cada mensaje del cliente y cada mensaje que
// el negocio escribe desde su app (para pausar al agente).
import { createAdminClient, createClient } from "npm:@insforge/sdk";
import { encryptCredentials, tryDecryptCredentials } from "./_shared/credentialsCrypto.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const YCLOUD_API_BASE = "https://api.ycloud.com/v2";
const WEBHOOK_EVENTS = ["whatsapp.inbound_message.received", "whatsapp.smb.message.echoes"];

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

interface YCloudPhoneNumber {
  phoneNumber?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  wabaId?: string;
  qualityRating?: string;
  status?: string;
}

async function ycloud(apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${YCLOUD_API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey, ...(init.headers ?? {}) }
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
  if (!userToken) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  if (!userData?.user?.id) return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);

  let body: { organization_id?: string; apiKey?: string; phoneNumber?: string; webhookBaseUrl?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { code: "VALIDATION_ERROR" } }, 400);
  }

  const organizationId = body.organization_id;
  const apiKey = body.apiKey?.trim();
  if (!organizationId || !apiKey) {
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Pegá la API key de YCloud." } }, 400);
  }

  // Redeploy forzado 2026-10-30 (ter, clave simplificada sin símbolos): una función ya desplegada sigue leyendo el
  // valor del secreto que tenía al publicarse, no el que se actualice
  // después en InsForge — hay que volver a publicarla para que lo recoja.
  const encryptionKey = Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return jsonResponse({ error: { code: "NOT_CONFIGURED", message: "Falta configurar el cifrado de credenciales en el servidor." } }, 500);
  }

  // URL pública del compute service (Railway) donde YCloud entrega los mensajes.
  const serverUrl = (Deno.env.get("SERVER_PUBLIC_URL") || body.webhookBaseUrl || "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(serverUrl)) {
    return jsonResponse({ error: { code: "NOT_CONFIGURED", message: "Falta la dirección pública del servidor para recibir los mensajes." } }, 500);
  }

  const { data: membership } = await userClient.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return jsonResponse({ error: { code: "FORBIDDEN" } }, 403);
  }

  // La API key se valida listando los números de WhatsApp de la cuenta.
  let numbers: YCloudPhoneNumber[];
  try {
    const res = await ycloud(apiKey, "/whatsapp/phoneNumbers?limit=100");
    if (res.status === 401 || res.status === 403) {
      return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "La API key de YCloud no es válida." } }, 400);
    }
    if (!res.ok) throw new Error(`status ${res.status}`);
    numbers = ((await res.json()) as { items?: YCloudPhoneNumber[] }).items ?? [];
  } catch (err) {
    console.error("ycloud_connect_list_numbers_failed", err);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo contactar a YCloud. Intentá de nuevo." } }, 502);
  }

  const wanted = body.phoneNumber ? normalizePhone(body.phoneNumber) : "";
  const candidates = numbers.filter((n) => n.phoneNumber && (!wanted || normalizePhone(n.phoneNumber) === wanted));
  if (candidates.length === 0) {
    return jsonResponse(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: wanted
            ? "Ese número no está en tu cuenta de YCloud. Revisá que lo hayas conectado allá primero."
            : "Tu cuenta de YCloud todavía no tiene un número de WhatsApp conectado."
        }
      },
      400
    );
  }
  if (candidates.length > 1) {
    return jsonResponse(
      { error: { code: "VALIDATION_ERROR", message: "Tu cuenta de YCloud tiene varios números: escribí cuál querés conectar." } },
      400
    );
  }
  const number = candidates[0];
  const phoneNumber = normalizePhone(number.phoneNumber!);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });

  // Un número solo puede atenderlo un negocio: si no, el agente de uno le
  // respondería a los clientes del otro.
  const { data: taken } = await admin.database
    .from("integrations")
    .select("organization_id")
    .eq("provider", "ycloud")
    .eq("status", "connected")
    .eq("metadata->>phone_number", phoneNumber);
  if ((taken ?? []).some((row: { organization_id: string }) => row.organization_id !== organizationId)) {
    return jsonResponse({ error: { code: "CONFLICT", message: "Ese número ya está conectado en otra cuenta de ReservasIA." } }, 409);
  }

  // Al reconectar, se borra el webhook anterior para no recibir cada mensaje dos veces.
  const { data: previous } = await admin.database
    .from("integrations")
    .select("credentials")
    .eq("organization_id", organizationId)
    .eq("provider", "ycloud")
    .maybeSingle();
  // Si las anteriores ya no se pueden leer (se cambió la clave), se reconecta igual: el webhook viejo
  // queda en YCloud apuntando a credenciales que el server descarta.
  const previousCredentials = ((await tryDecryptCredentials(previous?.credentials as Record<string, unknown> | null, encryptionKey)) ?? {}) as {
    api_key?: string;
    webhook_endpoint_id?: string;
  };
  if (previousCredentials?.webhook_endpoint_id && previousCredentials.api_key) {
    try {
      await ycloud(previousCredentials.api_key, `/webhookEndpoints/${previousCredentials.webhook_endpoint_id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("ycloud_connect_delete_previous_webhook_failed", err);
    }
  }

  let endpoint: { id?: string; secret?: string };
  try {
    const res = await ycloud(apiKey, "/webhookEndpoints", {
      method: "POST",
      body: JSON.stringify({
        url: `${serverUrl}/api/webhooks/ycloud/${organizationId}`,
        enabledEvents: WEBHOOK_EVENTS,
        description: "ReservasIA: agente de reservas",
        status: "active"
      })
    });
    if (!res.ok) throw new Error(`status ${res.status}: ${(await res.text()).slice(0, 300)}`);
    endpoint = await res.json();
  } catch (err) {
    console.error("ycloud_connect_create_webhook_failed", err);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "YCloud no aceptó el webhook. Intentá de nuevo." } }, 502);
  }
  if (!endpoint.id || !endpoint.secret) {
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "YCloud no devolvió el secreto del webhook." } }, 502);
  }

  const { error } = await admin.database.from("integrations").upsert(
    [
      {
        organization_id: organizationId,
        provider: "ycloud",
        status: "connected",
        credentials: await encryptCredentials({ api_key: apiKey, webhook_secret: endpoint.secret, webhook_endpoint_id: endpoint.id }, encryptionKey),
        metadata: {
          phone_number: phoneNumber,
          display_phone_number: number.displayPhoneNumber ?? phoneNumber,
          verified_name: number.verifiedName ?? null,
          waba_id: number.wabaId ?? null,
          quality_rating: number.qualityRating ?? null
        },
        connected_at: new Date().toISOString()
      }
    ],
    { onConflict: "organization_id,provider" }
  );

  if (error) {
    console.error("ycloud_connect_upsert_failed", error);
    return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "No se pudo guardar la integración." } }, 500);
  }

  return jsonResponse(
    { status: "connected", phoneNumber: number.displayPhoneNumber ?? phoneNumber, verifiedName: number.verifiedName ?? null },
    200
  );
}

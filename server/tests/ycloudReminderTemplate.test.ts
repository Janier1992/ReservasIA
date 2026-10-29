import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

/**
 * Recordatorios por WhatsApp con YCloud: la plantilla se crea sola la primera
 * vez, se espera a que Meta la apruebe y recién ahí se manda. YCloud se
 * reemplaza por un fetch simulado: nunca se llama a la API real.
 */

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { REMINDER_TEMPLATE_NAME, sendYCloudReminderTemplate } = await import("../src/services/ycloud/ycloudReminderTemplate.js");

const NOW = new Date("2030-01-10T15:00:00.000Z");
const VARIABLES = { "1": "Laura", "2": "Barbería El Corte", "3": "viernes 11 de enero a las 10:00" };

function integration(metadata: Record<string, unknown> = {}) {
  return {
    organizationId: "org-1",
    credentials: { api_key: "key-1", webhook_secret: "whsec" },
    phoneNumber: "+573000000000",
    metadata: { phone_number: "+573000000000", waba_id: "waba-1", ...metadata }
  };
}

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

/** Respuestas de YCloud por "MÉTODO ruta"; lo que no está configurado responde 404. */
function mockYCloud(routes: Record<string, { status?: number; body: unknown }>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? "GET"} ${new URL(url).pathname.replace(/^\/v2/, "")}`;
    const route = routes[key];
    return new Response(JSON.stringify(route?.body ?? {}), { status: route ? (route.status ?? 200) : 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof mockYCloud>) =>
  fetchMock.mock.calls.map(([url, init]) => ({
    key: `${(init as RequestInit | undefined)?.method ?? "GET"} ${new URL(url as string).pathname.replace(/^\/v2/, "")}`,
    body: (init as RequestInit | undefined)?.body ? JSON.parse((init as RequestInit).body as string) : undefined
  }));

/** El metadata que se guardó en integrations (si se guardó algo). */
function savedMetadata(): Record<string, unknown> | undefined {
  const updates = insforgeMockInstance.database.from.mock.results
    .map((r) => r.value as { update: ReturnType<typeof vi.fn> })
    .flatMap((query) => query.update.mock.calls);
  return (updates.at(-1)?.[0] as { metadata?: Record<string, unknown> } | undefined)?.metadata;
}

const TEMPLATE_PATH = `GET /whatsapp/templates/waba-1/${REMINDER_TEMPLATE_NAME}/es`;
const SENT = { "POST /whatsapp/messages/sendDirectly": { body: { id: "m-1", wamid: "wamid.1", status: "accepted" } } };

beforeEach(() => {
  insforgeMockInstance = createInsforgeMock({ integrations: { data: null, error: null }, inbound_message_claims: { data: null, error: null } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("plantilla de recordatorio de YCloud", () => {
  it("la primera vez crea la plantilla de utilidad en la cuenta del negocio y espera la aprobación sin mandar nada", async () => {
    const fetchMock = mockYCloud({ "POST /whatsapp/templates": { body: { status: "PENDING" } } });

    expect(await sendYCloudReminderTemplate(integration(), "+573001112233", VARIABLES, NOW)).toBe("no_template_configured");

    const [create] = calls(fetchMock);
    expect(create.key).toBe("POST /whatsapp/templates");
    expect(create.body).toMatchObject({ wabaId: "waba-1", name: REMINDER_TEMPLATE_NAME, language: "es", category: "UTILITY" });
    expect(create.body.components[0].text).toContain("{{1}}");
    expect(create.body.components[0].example.body_text[0]).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(savedMetadata()).toMatchObject({ waba_id: "waba-1", reminder_template: { status: "PENDING", checked_at: NOW.toISOString() } });
  });

  it("no le vuelve a preguntar a YCloud por una plantilla pendiente revisada hace poco", async () => {
    const fetchMock = mockYCloud({});
    const pending = integration({ reminder_template: { status: "PENDING", checked_at: minutesAgo(10) } });
    expect(await sendYCloudReminderTemplate(pending, "+573001112233", VARIABLES, NOW)).toBe("no_template_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cuando Meta la aprueba, manda el recordatorio con la plantilla y las tres variables", async () => {
    const fetchMock = mockYCloud({ [TEMPLATE_PATH]: { body: { status: "APPROVED" } }, ...SENT });
    const pending = integration({ reminder_template: { status: "PENDING", checked_at: minutesAgo(45) } });

    expect(await sendYCloudReminderTemplate(pending, "573001112233", VARIABLES, NOW)).toBe("sent");

    const send = calls(fetchMock).find((c) => c.key === "POST /whatsapp/messages/sendDirectly")!;
    expect(send.body).toEqual({
      from: "+573000000000",
      to: "+573001112233",
      type: "template",
      template: {
        name: REMINDER_TEMPLATE_NAME,
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Laura" },
              { type: "text", text: "Barbería El Corte" },
              { type: "text", text: "viernes 11 de enero a las 10:00" }
            ]
          }
        ]
      }
    });
    expect(savedMetadata()).toMatchObject({ reminder_template: { status: "APPROVED" } });
  });

  it("con la plantilla ya aprobada manda directo, sin revisar su estado", async () => {
    const fetchMock = mockYCloud(SENT);
    const approved = integration({ reminder_template: { status: "APPROVED", checked_at: minutesAgo(60 * 24 * 30) } });
    expect(await sendYCloudReminderTemplate(approved, "+573001112233", VARIABLES, NOW)).toBe("sent");
    expect(calls(fetchMock).map((c) => c.key)).toEqual(["POST /whatsapp/messages/sendDirectly"]);
  });

  it("si la plantilla ya existía en la cuenta (al reconectar), usa la que hay", async () => {
    mockYCloud({ "POST /whatsapp/templates": { status: 400, body: { error: "already exists" } }, [TEMPLATE_PATH]: { body: { status: "APPROVED" } }, ...SENT });
    expect(await sendYCloudReminderTemplate(integration(), "+573001112233", VARIABLES, NOW)).toBe("sent");
  });

  it("una plantilla rechazada no manda nada y queda registrada", async () => {
    const fetchMock = mockYCloud({ [TEMPLATE_PATH]: { body: { status: "REJECTED", reason: "INVALID_FORMAT" } } });
    const pending = integration({ reminder_template: { status: "PENDING", checked_at: minutesAgo(45) } });
    expect(await sendYCloudReminderTemplate(pending, "+573001112233", VARIABLES, NOW)).toBe("no_template_configured");
    expect(calls(fetchMock).map((c) => c.key)).toEqual([TEMPLATE_PATH]);
    expect(savedMetadata()).toMatchObject({ reminder_template: { status: "REJECTED", reason: "INVALID_FORMAT" } });
  });

  it("sin la cuenta de WhatsApp Business (waba_id) no intenta nada", async () => {
    const fetchMock = mockYCloud({});
    expect(await sendYCloudReminderTemplate(integration({ waba_id: null }), "+573001112233", VARIABLES, NOW)).toBe("no_template_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si WhatsApp rechaza el envío, falla para que el recordatorio no quede marcado como enviado", async () => {
    mockYCloud({ "POST /whatsapp/messages/sendDirectly": { body: { status: "failed", errorCode: "131026", errorMessage: "undeliverable" } } });
    const approved = integration({ reminder_template: { status: "APPROVED", checked_at: minutesAgo(5) } });
    await expect(sendYCloudReminderTemplate(approved, "+573001112233", VARIABLES, NOW)).rejects.toThrow("131026");
  });
});

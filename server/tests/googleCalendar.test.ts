import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

/**
 * Sincronización con Google Calendar (googleService): qué evento se crea,
 * cuándo se invita al cliente, qué pasa si el negocio no está conectado y
 * cómo se guardan las credenciales al conectar o al renovar el token.
 * googleapis se reemplaza por un doble: nunca se llama a Google.
 */

const google = vi.hoisted(() => {
  const state = {
    insert: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    getToken: vi.fn(),
    userinfo: vi.fn(),
    /** Lo que el cliente OAuth registra con on("tokens", ...). */
    onTokens: null as null | ((tokens: Record<string, unknown>) => void),
    credentials: null as unknown
  };
  return state;
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        getToken = google.getToken;
        setCredentials(credentials: unknown) {
          google.credentials = credentials;
        }
        on(event: string, handler: (tokens: Record<string, unknown>) => void) {
          if (event === "tokens") google.onTokens = handler;
        }
      }
    },
    calendar: () => ({ events: { insert: google.insert, patch: google.patch, delete: google.remove } }),
    oauth2: () => ({ userinfo: { get: google.userinfo } })
  }
}));

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { createCalendarEvent, deleteCalendarEvent, handleGoogleOAuthCallback, updateCalendarEvent } = await import(
  "../src/services/google/googleService.js"
);
const { env } = await import("../src/config/env.js");
const { decryptCredentials } = await import("../src/lib/credentialsCrypto.js");

const CONNECTED = {
  organization_id: "org-1",
  provider: "google_calendar",
  status: "connected",
  credentials: { access_token: "a", refresh_token: "r" },
  metadata: { email: "negocio@test.local", calendarId: "primary" }
};

const reservation = (extra: Record<string, unknown> = {}) =>
  ({
    id: "res-1",
    organization_id: "org-1",
    customer_id: "cust-1",
    customer_name: "Laura Gómez",
    party_size: 2,
    special_requests: "Mesa junto a la ventana",
    start_at: "2030-01-10T15:00:00.000Z",
    end_at: "2030-01-10T16:00:00.000Z",
    google_event_id: null,
    ...extra
  }) as never;

function connectedBusiness(customerEmail: string | null = "laura@test.local") {
  insforgeMockInstance = createInsforgeMock({
    integrations: { data: CONNECTED, error: null },
    organizations: { data: { timezone: "America/Bogota" }, error: null },
    customers: { data: { email: customerEmail, name: "Laura Gómez" }, error: null }
  });
}

/** El upsert que guardó las credenciales en integrations (si hubo). */
function savedIntegration(): Record<string, unknown> | undefined {
  const calls = insforgeMockInstance.database.from.mock.results
    .map((r) => r.value as { upsert: ReturnType<typeof vi.fn> })
    .flatMap((query) => query.upsert.mock.calls);
  return (calls.at(-1)?.[0] as Record<string, unknown>[] | undefined)?.[0];
}

describe("eventos de Google Calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    google.onTokens = null;
    google.insert.mockResolvedValue({ data: { id: "evt-1" } });
    google.patch.mockResolvedValue({ data: {} });
    google.remove.mockResolvedValue({ data: {} });
  });

  it("no toca Google si el negocio no tiene el calendario conectado", async () => {
    insforgeMockInstance = createInsforgeMock({ integrations: { data: { ...CONNECTED, status: "disconnected" }, error: null } });
    expect(await createCalendarEvent(reservation())).toBeNull();
    insforgeMockInstance = createInsforgeMock({ integrations: { data: null, error: null } });
    expect(await createCalendarEvent(reservation())).toBeNull();
    expect(google.insert).not.toHaveBeenCalled();
  });

  it("crea el evento en la zona horaria del negocio e invita al cliente con su correo", async () => {
    connectedBusiness();
    expect(await createCalendarEvent(reservation())).toBe("evt-1");
    expect(google.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      sendUpdates: "all",
      requestBody: {
        summary: "Reserva: Laura Gómez",
        description: "Cliente: Laura Gómez\nPersonas: 2\nNotas: Mesa junto a la ventana\nID de reserva: res-1",
        start: { dateTime: "2030-01-10T15:00:00.000Z", timeZone: "America/Bogota" },
        end: { dateTime: "2030-01-10T16:00:00.000Z", timeZone: "America/Bogota" },
        attendees: [{ email: "laura@test.local", displayName: "Laura Gómez" }]
      }
    });
  });

  it("no invita al cliente cuando ya le llegó el correo propio del negocio", async () => {
    connectedBusiness();
    await createCalendarEvent(reservation(), { notifyCustomer: false });
    const call = google.insert.mock.calls[0][0] as { sendUpdates: string; requestBody: { attendees?: unknown } };
    expect(call.sendUpdates).toBe("none");
    expect(call.requestBody.attendees).toBeUndefined();
    expect(insforgeMockInstance.database.from).not.toHaveBeenCalledWith("customers");
  });

  it("sin correo del cliente, el evento queda solo en el calendario del negocio", async () => {
    connectedBusiness(null);
    await createCalendarEvent(reservation({ party_size: null, special_requests: null }));
    const call = google.insert.mock.calls[0][0] as { sendUpdates: string; requestBody: { attendees?: unknown; description: string } };
    expect(call.sendUpdates).toBe("none");
    expect(call.requestBody.attendees).toBeUndefined();
    expect(call.requestBody.description).toBe("Cliente: Laura Gómez\nID de reserva: res-1");
  });

  it("al reprogramar actualiza el mismo evento, y no hace nada si la reserva no tenía evento", async () => {
    connectedBusiness();
    await updateCalendarEvent(reservation());
    expect(google.patch).not.toHaveBeenCalled();

    await updateCalendarEvent(reservation({ google_event_id: "evt-1" }), { notifyCustomer: false });
    expect(google.patch).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "primary", eventId: "evt-1", sendUpdates: "none" }));
  });

  it("al cancelar borra el evento; si Google ya no lo tiene (404 o 410) no es un error", async () => {
    connectedBusiness();
    await deleteCalendarEvent("org-1", "evt-1");
    expect(google.remove).toHaveBeenCalledWith({ calendarId: "primary", eventId: "evt-1", sendUpdates: "all" });

    for (const status of [404, 410]) {
      google.remove.mockRejectedValueOnce({ response: { status } });
      await expect(deleteCalendarEvent("org-1", "evt-1", { notifyCustomer: false })).resolves.toBeUndefined();
    }
    google.remove.mockRejectedValueOnce({ response: { status: 500 } });
    await expect(deleteCalendarEvent("org-1", "evt-1")).rejects.toEqual({ response: { status: 500 } });
  });

  it("cuando Google renueva el token, guarda las credenciales nuevas sin perder las anteriores", async () => {
    connectedBusiness();
    await createCalendarEvent(reservation());
    expect(google.onTokens).toBeTypeOf("function");
    google.onTokens!({ access_token: "nuevo" });
    await Promise.resolve();
    const saved = savedIntegration();
    expect(saved).toMatchObject({ organization_id: "org-1", status: "connected" });
    expect(decryptCredentials(saved?.credentials as Record<string, unknown>)).toEqual({ access_token: "nuevo", refresh_token: "r" });
  });
});

describe("conexión con Google (callback de OAuth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = createInsforgeMock({ integrations: { data: null, error: null } });
  });

  it("guarda los tokens y el correo de la cuenta conectada para el negocio del state firmado", async () => {
    const encoded = Buffer.from(JSON.stringify({ organizationId: "org-1", ts: Date.now() })).toString("base64url");
    const state = `${encoded}.${crypto.createHmac("sha256", env.OAUTH_STATE_SECRET).update(encoded).digest("base64url")}`;
    google.getToken.mockResolvedValue({
      tokens: { access_token: "a", refresh_token: "r", scope: "calendar", token_type: "Bearer", expiry_date: 1 }
    });
    google.userinfo.mockResolvedValue({ data: { email: "negocio@test.local" } });

    expect(await handleGoogleOAuthCallback("code-1", state)).toEqual({ organizationId: "org-1" });
    expect(google.getToken).toHaveBeenCalledWith("code-1");
    const saved = savedIntegration();
    expect(saved).toMatchObject({
      organization_id: "org-1",
      provider: "google_calendar",
      status: "connected",
      metadata: { email: "negocio@test.local", calendarId: "primary" }
    });
    expect(decryptCredentials(saved?.credentials as Record<string, unknown>)).toMatchObject({ access_token: "a", refresh_token: "r" });
  });

  it("no conecta nada si el state no viene firmado por el servidor", async () => {
    await expect(handleGoogleOAuthCallback("code-1", "falso.firma")).rejects.toThrow("Estado de OAuth inválido");
    expect(google.getToken).not.toHaveBeenCalled();
  });
});

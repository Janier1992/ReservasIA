import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Alertas por correo cuando algo falla seguido (lib/alerts.ts): un error
 * suelto no avisa, cinco del mismo tipo en diez minutos sí, una vez por hora,
 * y el correo nunca lleva datos de clientes.
 */

process.env.ALERT_EMAIL = "dueno@test.local, soporte@test.local";
const sendMock = vi.fn(async (_options: { to: string[]; subject: string; html: string }) => ({ data: {}, error: null }));
vi.mock("../src/lib/insforge.js", () => ({ insforgeAdmin: { emails: { send: (options: never) => sendMock(options) } } }));

const { ALERT_COOLDOWN_MS, ALERT_THRESHOLD, ALERT_WINDOW_MS, reportCriticalFailure, reportFailure, resetAlerts } = await import(
  "../src/lib/alerts.js"
);

const T0 = 1_900_000_000_000;
const failTimes = (kind: string, times: number, start = T0, gapMs = 1000) => {
  for (let i = 0; i < times; i++) reportFailure(kind, new Error(`timeout ${i}`), start + i * gapMs);
};

beforeEach(() => {
  resetAlerts();
  sendMock.mockClear();
});

describe("alertas por fallas repetidas", () => {
  it("un error suelto, o pocos, no avisa", () => {
    failTimes("agent_ai", ALERT_THRESHOLD - 1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("cinco fallas del mismo tipo en diez minutos mandan un correo a cada destinatario", () => {
    failTimes("agent_ai", ALERT_THRESHOLD);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [{ to, subject, html }] = sendMock.mock.calls[0];
    expect(to).toEqual(["dueno@test.local", "soporte@test.local"]);
    expect(subject).toBe("[ReservasIA] Alerta: El agente no pudo consultar a la IA (OpenRouter/OpenAI)");
    expect(html).toContain("Pasó 5 veces en los últimos 10 minutos");
    expect(html).toContain(`timeout ${ALERT_THRESHOLD - 1}`);
  });

  it("fallas espaciadas más que la ventana no se acumulan", () => {
    failTimes("agent_ai", ALERT_THRESHOLD, T0, ALERT_WINDOW_MS / 2);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("si sigue fallando, no vuelve a avisar hasta pasada una hora", () => {
    failTimes("channel_message", ALERT_THRESHOLD * 3);
    expect(sendMock).toHaveBeenCalledTimes(1);
    failTimes("channel_message", ALERT_THRESHOLD, T0 + ALERT_COOLDOWN_MS + 1);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("cada tipo de falla avisa por separado y nombra la tarea programada que falla", () => {
    failTimes("agent_ai", ALERT_THRESHOLD);
    failTimes("scheduled_job:reminders", ALERT_THRESHOLD);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1][0].subject).toBe('[ReservasIA] Alerta: Falla la tarea programada "reminders"');
  });

  it("el correo lleva solo el mensaje técnico recortado y escapado, no el objeto del error", () => {
    const err = Object.assign(new Error(`<b>fallo</b> ${"x".repeat(500)}`), { customer: { phone: "+573001112233" } });
    for (let i = 0; i < ALERT_THRESHOLD; i++) reportFailure("server_error", err, T0 + i);
    const { html } = sendMock.mock.calls[0][0];
    expect(html).toContain("&lt;b&gt;fallo&lt;/b&gt;");
    expect(html).not.toContain("+573001112233");
    expect(html).not.toContain("x".repeat(250));
  });

  it("si mandar el correo falla, no rompe a quien reportó la falla", () => {
    sendMock.mockRejectedValueOnce(new Error("sin cuota"));
    expect(() => failTimes("agent_ai", ALERT_THRESHOLD)).not.toThrow();
  });

  it("una falla crítica (la conexión con Google venció) avisa a la primera, una vez por hora", () => {
    reportCriticalFailure("google_connection_expired", new Error("invalid_grant"), T0);
    reportCriticalFailure("google_connection_expired", new Error("invalid_grant"), T0 + 1000);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [{ subject, html }] = sendMock.mock.calls[0];
    expect(subject).toContain("Venció la conexión de un negocio con Google Calendar");
    expect(html).toContain("Pasó recién.");
  });
});

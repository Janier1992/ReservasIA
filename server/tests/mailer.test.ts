import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * El correo sale por Brevo cuando está configurado y, si no, por InsForge.
 * fetch y InsForge se reemplazan por dobles: nunca se manda un correo real.
 */
const insforgeSend = vi.fn();
vi.mock("../src/lib/insforge.js", () => ({ insforgeAdmin: { emails: { send: (o: never) => insforgeSend(o) } } }));

async function loadMailer(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("../src/lib/mailer.js");
}

const email = { to: "cliente@test.local", subject: "Tu reserva", html: "<p>Hola</p>", replyTo: "negocio@test.local" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("envío de correos", () => {
  it("con Brevo configurado, manda por su API con el remitente verificado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "m-1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail, activeMailProvider } = await loadMailer({ BREVO_API_KEY: "clave-de-prueba", MAIL_FROM_EMAIL: "reservas@test.local" });

    expect(activeMailProvider()).toBe("brevo");
    expect(await sendEmail(email)).toEqual({ ok: true, provider: "brevo" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("clave-de-prueba");
    expect(JSON.parse(init.body)).toEqual({
      sender: { email: "reservas@test.local", name: "ReservasIA" },
      to: [{ email: "cliente@test.local" }],
      subject: "Tu reserva",
      htmlContent: "<p>Hola</p>",
      replyTo: { email: "negocio@test.local" }
    });
    expect(insforgeSend).not.toHaveBeenCalled();
  });

  it("si Brevo rechaza el envío, devuelve el motivo sin el correo del cliente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "unauthorized", message: "Sender not valid" }), { status: 401 }))
    );
    const { sendEmail } = await loadMailer({ BREVO_API_KEY: "clave", MAIL_FROM_EMAIL: "reservas@test.local" });

    const result = await sendEmail(email);
    expect(result).toEqual({ ok: false, provider: "brevo", error: "HTTP 401 unauthorized: Sender not valid" });
    expect(result.error).not.toMatch(/cliente@test/);
  });

  it("si Brevo no responde, no lanza", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const { sendEmail } = await loadMailer({ BREVO_API_KEY: "clave", MAIL_FROM_EMAIL: "reservas@test.local" });
    expect(await sendEmail(email)).toEqual({ ok: false, provider: "brevo", error: "timeout" });
  });

  it("sin Brevo, sigue usando InsForge", async () => {
    insforgeSend.mockResolvedValue({ data: {}, error: null });
    const { sendEmail, activeMailProvider } = await loadMailer({ BREVO_API_KEY: "", MAIL_FROM_EMAIL: "" });

    expect(activeMailProvider()).toBe("insforge");
    expect(await sendEmail(email)).toEqual({ ok: true, provider: "insforge" });
    expect(insforgeSend).toHaveBeenCalledWith(email);
  });

  it("si InsForge no envía, lo informa", async () => {
    insforgeSend.mockResolvedValue({ data: null, error: { message: "Email sending is not enabled" } });
    const { sendEmail } = await loadMailer({ BREVO_API_KEY: "", MAIL_FROM_EMAIL: "" });
    expect(await sendEmail(email)).toEqual({ ok: false, provider: "insforge", error: "Email sending is not enabled" });
  });
});

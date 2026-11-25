import { env } from "../config/env.js";
import { insforgeAdmin } from "./insforge.js";

/**
 * Envío de correos transaccionales (confirmaciones de reserva y alertas).
 *
 * Si Brevo está configurado (BREVO_API_KEY y MAIL_FROM_EMAIL), el correo sale
 * por su API web: InsForge no envía correos propios en el plan gratis y
 * Railway bloquea SMTP en sus planes básicos, así que una API por HTTPS es lo
 * que funciona en todos los casos. Sin Brevo se sigue usando InsForge, como
 * antes. Nunca lanza: devuelve { ok, error } para que quien llama decida.
 */
export interface OutgoingEmail {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export type MailProvider = "brevo" | "insforge";

export interface SendResult {
  ok: boolean;
  provider: MailProvider;
  /** Motivo de la falla, sin datos del destinatario. */
  error?: string;
}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 10_000;

export function activeMailProvider(): MailProvider {
  return env.BREVO_API_KEY && env.MAIL_FROM_EMAIL ? "brevo" : "insforge";
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  return activeMailProvider() === "brevo" ? sendWithBrevo(email) : sendWithInsforge(email);
}

async function sendWithBrevo(email: OutgoingEmail): Promise<SendResult> {
  const recipients = (Array.isArray(email.to) ? email.to : [email.to]).map((address) => ({ email: address }));
  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME },
        to: recipients,
        subject: email.subject,
        htmlContent: email.html,
        ...(email.replyTo ? { replyTo: { email: email.replyTo } } : {})
      }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS)
    });
    if (res.ok) return { ok: true, provider: "brevo" };
    // Brevo responde { code, message } (p. ej. "unauthorized", remitente sin verificar).
    const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    return { ok: false, provider: "brevo", error: `HTTP ${res.status}${body?.code ? ` ${body.code}` : ""}: ${body?.message ?? "sin detalle"}`.slice(0, 300) };
  } catch (err) {
    return { ok: false, provider: "brevo", error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendWithInsforge(email: OutgoingEmail): Promise<SendResult> {
  try {
    const { error } = await insforgeAdmin.emails.send({ to: email.to, subject: email.subject, html: email.html, replyTo: email.replyTo });
    if (!error) return { ok: true, provider: "insforge" };
    return { ok: false, provider: "insforge", error: (error as { message?: string }).message ?? "InsForge no envió el correo" };
  } catch (err) {
    return { ok: false, provider: "insforge", error: err instanceof Error ? err.message : String(err) };
  }
}

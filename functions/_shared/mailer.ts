/**
 * Envío de correos desde las Edge Functions, igual que server/src/lib/mailer.ts:
 * por Brevo si están los secretos BREVO_API_KEY y MAIL_FROM_EMAIL en InsForge,
 * y si no, por el envío de InsForge. Nunca lanza; devuelve si salió.
 */
type EmailSender = {
  emails: { send: (options: { to: string | string[]; subject: string; html: string }) => Promise<{ error: unknown }> };
};

export async function sendEmail(
  admin: EmailSender,
  email: { to: string | string[]; subject: string; html: string },
  logTag: string
): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY") ?? "";
  const fromEmail = Deno.env.get("MAIL_FROM_EMAIL") ?? "";
  try {
    if (apiKey && fromEmail) {
      const recipients = (Array.isArray(email.to) ? email.to : [email.to]).map((address) => ({ email: address }));
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { email: fromEmail, name: Deno.env.get("MAIL_FROM_NAME") || "ReservasIA" },
          to: recipients,
          subject: email.subject,
          htmlContent: email.html
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (res.ok) return true;
      console.error(logTag, { provider: "brevo", status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) });
      return false;
    }
    const { error } = await admin.emails.send(email);
    if (!error) return true;
    console.error(logTag, { provider: "insforge", error });
    return false;
  } catch (err) {
    console.error(logTag, err);
    return false;
  }
}

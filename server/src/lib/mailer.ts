import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { insforgeAdmin } from "./insforge.js";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  /** Nombre visible del remitente (ej. el del negocio); la dirección es la de la cuenta SMTP. */
  fromName?: string;
  replyTo?: string;
}

let transporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

function smtp(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
  return transporter;
}

/** Quita comillas y saltos de línea del nombre visible (irían dentro del encabezado From). */
function displayName(name: string): string {
  return name.replace(/["\r\n<>]/g, "").trim().slice(0, 80);
}

/**
 * Envía un correo por SMTP (Gmail de la plataforma) si está configurado; si
 * no, por el módulo de emails de InsForge (requiere plan pago). Lanza si falla.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (isSmtpConfigured()) {
    const name = email.fromName ? displayName(email.fromName) : "";
    await smtp().sendMail({
      from: name ? { name, address: env.SMTP_USER } : env.SMTP_USER,
      to: email.to,
      subject: email.subject,
      html: email.html,
      replyTo: email.replyTo
    });
    return;
  }
  const { error } = await insforgeAdmin.emails.send({ to: email.to, subject: email.subject, html: email.html, replyTo: email.replyTo });
  if (error) throw new Error(error.message);
}

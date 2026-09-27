/**
 * Encuestas de satisfacción y recuperación de clientes: enlaces, mensajes y
 * métricas. Nada de esto manda mensajes solo: arma el texto y el enlace para
 * que el equipo lo envíe por WhatsApp o por el chat.
 */

const TELEGRAM_PREFIX = "telegram:";

/** Enlace público de la encuesta (/o/<token>) en el mismo dominio del panel. */
export function surveyUrl(token: string, origin = typeof window !== "undefined" ? window.location.origin : ""): string {
  return `${origin}/o/${token}`;
}

/**
 * Número para wa.me: solo dígitos, con código de país. Los celulares
 * colombianos guardados sin indicativo (10 dígitos que empiezan en 3) se
 * completan con 57. Los clientes de Telegram no tienen número: null.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone || phone.startsWith(TELEGRAM_PREFIX)) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits.length >= 8 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function surveyMessage(customerName: string | null | undefined, businessName: string, url: string): string {
  const name = firstName(customerName);
  return `${name ? `Hola ${name}` : "Hola"}, gracias por visitarnos en ${businessName}. ¿Nos contás cómo te fue? Son 10 segundos: ${url}`;
}

export const DEFAULT_REACTIVATION_TEMPLATE =
  "Hola {nombre}, te extrañamos en {negocio}. ¿Te agendamos una visita esta semana? Respondé este mensaje y te buscamos un horario.";

export function fillReactivationTemplate(template: string, customerName: string | null | undefined, businessName: string): string {
  const name = firstName(customerName);
  return template
    .replace(/\{nombre\}/g, name)
    .replace(/\{negocio\}/g, businessName)
    .replace(/\s+,/g, ",")
    .replace(/Hola ,/, "Hola,");
}

export interface RatingStats {
  sent: number;
  answered: number;
  responseRate: number | null; // 0..100
  average: number | null; // 1 decimal
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  promoters: number; // 4-5
  detractors: number; // 1-2
}

export function ratingStats(requests: { rating: number | null }[]): RatingStats {
  const distribution: RatingStats["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let answered = 0;
  for (const r of requests) {
    if (r.rating === null || r.rating < 1 || r.rating > 5) continue;
    distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
    sum += r.rating;
    answered++;
  }
  return {
    sent: requests.length,
    answered,
    responseRate: requests.length ? Math.round((answered / requests.length) * 100) : null,
    average: answered ? Math.round((sum / answered) * 10) / 10 : null,
    distribution,
    promoters: distribution[4] + distribution[5],
    detractors: distribution[1] + distribution[2]
  };
}

/** "hace 3 meses" / "hace 52 días" para la lista de recuperación. */
export function daysSince(iso: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function sinceLabel(iso: string, now = new Date()): string {
  const days = daysSince(iso, now);
  if (days < 60) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months < 12 ? `hace ${months} meses` : `hace más de un año`;
}

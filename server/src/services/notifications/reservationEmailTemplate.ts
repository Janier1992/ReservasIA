import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";

/**
 * Correo de reserva con la marca del negocio (logo, nombre, eslogan). HTML con
 * tablas y estilos en línea: es lo único que Gmail, Outlook y Apple Mail
 * muestran igual. Todo dato que viene del negocio o del cliente se escapa.
 */

export type ReservationEmailKind = "confirmed" | "rescheduled" | "cancelled";

export interface ReservationEmailData {
  kind: ReservationEmailKind;
  business: { name: string; logoUrl: string | null; slogan: string | null; address: string | null; phone: string | null };
  customerName: string | null;
  serviceName: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  partySize: number | null;
  notes: string | null;
  cancellationPolicy?: string | null;
}

const ACCENT = "#C2410C";
const INK = "#1C1917";
const MUTED = "#78716C";
const LINE = "#E7E5E4";

const COPY: Record<ReservationEmailKind, { title: string; intro: string; subject: string }> = {
  confirmed: { title: "Tu reserva está confirmada", intro: "Te esperamos. Estos son los detalles:", subject: "Tu reserva está confirmada" },
  rescheduled: { title: "Tu reserva cambió de horario", intro: "Actualizamos tu reserva. Así quedó:", subject: "Tu reserva cambió de horario" },
  cancelled: { title: "Tu reserva fue cancelada", intro: "Esta reserva ya no está activa:", subject: "Tu reserva fue cancelada" }
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const toGoogleDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Enlace de "Agregar a Google Calendar" (sin necesidad de que el cliente tenga cuenta en la app). */
export function googleCalendarLink(data: ReservationEmailData): string {
  const title = data.serviceName ? `${data.serviceName} · ${data.business.name}` : `Reserva en ${data.business.name}`;
  const details = [data.partySize ? `Personas: ${data.partySize}` : null, data.notes ? `Notas: ${data.notes}` : null, data.business.phone ? `Teléfono: ${data.business.phone}` : null]
    .filter(Boolean)
    .join("\n");
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${toGoogleDate(data.startAt)}/${toGoogleDate(data.endAt)}`, ctz: data.timezone });
  if (details) params.set("details", details);
  if (data.business.address) params.set("location", data.business.address);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function whenLabels(data: ReservationEmailData) {
  const format = (iso: string, pattern: string) => formatInTimeZone(new Date(iso), data.timezone, pattern, { locale: es });
  // "2:00 p. m." como se escribe en Colombia (date-fns en español pone "PM").
  const time = (iso: string) => `${format(iso, "h:mm")} ${Number(format(iso, "H")) < 12 ? "a. m." : "p. m."}`;
  const day = format(data.startAt, "EEEE d 'de' MMMM 'de' yyyy");
  return {
    day: day.charAt(0).toUpperCase() + day.slice(1),
    time: `${time(data.startAt)} – ${time(data.endAt)}`,
    short: `${format(data.startAt, "EEE d 'de' MMM")}, ${time(data.startAt)}`
  };
}

function detailRow(label: string, value: string): string {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:14px;width:38%;vertical-align:top">${label}</td><td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:15px;font-weight:600;vertical-align:top">${value}</td></tr>`;
}

function header(business: ReservationEmailData["business"]): string {
  const name = escapeHtml(business.name);
  const mark = business.logoUrl
    ? `<img src="${escapeHtml(business.logoUrl)}" width="64" height="64" alt="${name}" style="display:block;margin:0 auto 12px;border-radius:16px;object-fit:cover">`
    : `<div style="width:64px;height:64px;margin:0 auto 12px;border-radius:16px;background:${ACCENT};color:#fff;font-size:28px;font-weight:700;line-height:64px;text-align:center">${escapeHtml(business.name.trim().charAt(0).toUpperCase() || "R")}</div>`;
  const slogan = business.slogan ? `<p style="margin:6px 0 0;color:${MUTED};font-size:14px">${escapeHtml(business.slogan)}</p>` : "";
  return `<td style="padding:32px 32px 8px;text-align:center">${mark}<p style="margin:0;color:${INK};font-size:20px;font-weight:700">${name}</p>${slogan}</td>`;
}

export function buildReservationEmail(data: ReservationEmailData): { subject: string; html: string } {
  const copy = COPY[data.kind];
  const when = whenLabels(data);
  const first = (data.customerName ?? "").trim().split(/\s+/)[0];
  const rows = [
    data.serviceName ? detailRow("Servicio", escapeHtml(data.serviceName)) : "",
    detailRow("Fecha", escapeHtml(when.day)),
    detailRow("Hora", escapeHtml(when.time)),
    data.partySize ? detailRow("Personas", String(data.partySize)) : "",
    data.notes ? detailRow("Notas", escapeHtml(data.notes)) : "",
    data.business.address ? detailRow("Dirección", escapeHtml(data.business.address)) : ""
  ].join("");
  const button =
    data.kind === "cancelled"
      ? ""
      : `<tr><td style="padding:8px 32px 8px;text-align:center"><a href="${escapeHtml(googleCalendarLink(data))}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:12px">Agregar a Google Calendar</a></td></tr>`;
  const contact = data.business.phone
    ? `¿Necesitás cambiarla? Escribinos por el mismo chat o llamanos al ${escapeHtml(data.business.phone)}.`
    : "¿Necesitás cambiarla? Escribinos por el mismo chat donde hiciste la reserva.";
  const statusColor = data.kind === "cancelled" ? "#B91C1C" : ACCENT;
  const policy =
    data.cancellationPolicy && data.kind !== "cancelled"
      ? `<tr><td style="padding:0 32px 8px"><p style="margin:0;padding:12px 14px;background:#FAFAF9;border-radius:10px;color:${MUTED};font-size:13px"><strong style="color:${INK}">Política de cancelación:</strong> ${escapeHtml(data.cancellationPolicy)}</p></td></tr>`
      : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title></head>
<body style="margin:0;padding:0;background:#F5F5F4;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(`${copy.title}: ${when.short}`)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid ${LINE}">
<tr><td style="height:6px;background:${statusColor}"></td></tr>
<tr>${header(data.business)}</tr>
<tr><td style="padding:16px 32px 4px"><p style="margin:0;color:${statusColor};font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(copy.title)}</p>
<p style="margin:8px 0 0;color:${INK};font-size:17px">${first ? `Hola ${escapeHtml(first)}, ` : ""}${escapeHtml(copy.intro)}</p></td></tr>
<tr><td style="padding:8px 32px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
${button}
${policy}
<tr><td style="padding:16px 32px 28px;text-align:center;color:${MUTED};font-size:14px">${contact}</td></tr>
<tr><td style="padding:18px 32px;background:#FAFAF9;border-top:1px solid ${LINE};text-align:center;color:${MUTED};font-size:12px">${escapeHtml(
    [data.business.name, data.business.address, data.business.phone].filter(Boolean).join(" · ")
  )}<br>Reservas gestionadas con ReservasIA</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: `${copy.subject} · ${data.business.name} · ${when.short}`, html };
}

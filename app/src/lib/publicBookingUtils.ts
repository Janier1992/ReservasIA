// Utilidades puras de la página pública de reservas (sin dependencias de env).

/** Próximos `count` días (YYYY-MM-DD) en la zona horaria del negocio, empezando hoy. */
export function upcomingDates(timezone: string, count: number, now = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dates: string[] = [];
  for (let offset = 0; dates.length < count && offset < count + 2; offset++) {
    const day = fmt.format(new Date(now.getTime() + offset * 24 * 60 * 60 * 1000));
    if (!dates.includes(day)) dates.push(day);
  }
  return dates;
}

export function publicBookingUrl(slug: string, origin = window.location.origin): string {
  return `${origin}/r/${slug}`;
}

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

/**
 * Qué muestra la página pública: pedido inmediato a la fila (restaurante con
 * Atención en sitio) o reserva con día y hora. Misma regla que
 * publicPageMode en server/src/services/publicBooking/publicBookingService.ts.
 */
export function publicPageMode(businessType: string, disabledModules: readonly string[] | null | undefined): "order" | "booking" {
  return businessType === "restaurant" && !(disabledModules ?? []).includes("walk_ins") ? "order" : "booking";
}

export function publicBookingUrl(slug: string, origin = window.location.origin): string {
  return `${origin}/r/${slug}`;
}

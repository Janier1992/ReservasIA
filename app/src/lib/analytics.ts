import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * Medición de visitas con Vercel Analytics (sin cookies). Solo se cuentan
 * las páginas públicas de presentación y registro: lo que pasa dentro del
 * panel de cada negocio (direcciones con ids de clientes, reservas, etc.)
 * nunca sale del navegador.
 */
const TRACKED_PATHS = new Set(["/", "/login", "/register", "/privacidad", "/terminos"]);

export function onlyPublicPages(event: BeforeSendEvent): BeforeSendEvent | null {
  const path = new URL(event.url).pathname.replace(/\/+$/, "") || "/";
  return TRACKED_PATHS.has(path) ? event : null;
}

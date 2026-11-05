// Enlace "cómo llegar" del negocio. Sin dependencias a propósito: lo usan
// las instrucciones del agente (que también publica la vista previa como
// Edge Function), la página pública y el correo de confirmación.

/** Lo que hace falta del perfil del negocio para armar el enlace. */
export interface BusinessLocation {
  address?: string | null;
  maps_url?: string | null;
}

/**
 * El enlace de mapa que cargó el negocio o, si no cargó ninguno, una
 * búsqueda de Google Maps con su dirección. null si no hay ni lo uno ni lo
 * otro. Solo se acepta https (la base también lo exige).
 */
export function businessMapsUrl(location: BusinessLocation): string | null {
  const custom = location.maps_url?.trim();
  if (custom && custom.startsWith("https://")) return custom;
  const address = location.address?.trim();
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

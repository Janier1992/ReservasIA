// Enlace "cómo llegar" del negocio en el panel. Misma regla que
// server/src/utils/location.ts (que es la que usan el agente, la página
// pública y el correo): el enlace que cargó el negocio o, si no hay, una
// búsqueda de Google Maps con la dirección.
export function businessMapsUrl(location: { address?: string | null; maps_url?: string | null }): string | null {
  const custom = location.maps_url?.trim();
  if (custom && custom.startsWith("https://")) return custom;
  const address = location.address?.trim();
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

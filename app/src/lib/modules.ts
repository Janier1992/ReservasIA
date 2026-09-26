/**
 * Módulos opcionales del dashboard que soporte puede activar o desactivar
 * por negocio (organizations.disabled_modules). Inicio, Reservas y
 * Configuración son la base del producto y no se pueden apagar.
 *
 * Se guarda la lista de APAGADOS (no la de encendidos) para que un negocio
 * existente tenga todo activo sin migrar datos. Si agregás un módulo acá,
 * sumalo también al check de la migración organization-disabled-modules.
 */
export const OPTIONAL_MODULES = [
  { key: "inbox", label: "Inbox", description: "Conversaciones de Telegram y WhatsApp atendidas por el agente." },
  { key: "customers", label: "Clientes", description: "Fichas de clientes e historial de atenciones." },
  { key: "services", label: "Servicios", description: "Catálogo de servicios, precios y carga por Excel." },
  { key: "resources", label: "Recursos", description: "Personal, mesas, bahías, cabinas o consultorios." },
  { key: "agent", label: "Agente IA", description: "Configuración y vista previa del agente. Apagarlo oculta la página, no pausa el agente." },
  { key: "integrations", label: "Integraciones", description: "Conexión de Telegram, WhatsApp y Google Calendar." },
  { key: "team", label: "Equipo", description: "Invitar y gestionar miembros del negocio." }
] as const;

export type ModuleKey = (typeof OPTIONAL_MODULES)[number]["key"];

const MODULE_KEYS = new Set<string>(OPTIONAL_MODULES.map((m) => m.key));

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEYS.has(value);
}

export function isModuleEnabled(disabledModules: readonly string[] | null | undefined, key: ModuleKey): boolean {
  return !(disabledModules ?? []).includes(key);
}

/**
 * Nueva lista de apagados al prender/apagar un módulo: sin duplicados, en
 * orden estable, y conservando claves que esta versión del front no conoce
 * (un módulo agregado después no se reactiva por guardar desde acá).
 */
export function toggleModule(disabledModules: readonly string[] | null | undefined, key: ModuleKey, enabled: boolean): string[] {
  const current = new Set(disabledModules ?? []);
  if (enabled) current.delete(key);
  else current.add(key);
  const known = OPTIONAL_MODULES.map((m) => m.key).filter((k) => current.has(k));
  const unknown = [...current].filter((k) => !isModuleKey(k));
  return [...known, ...unknown];
}

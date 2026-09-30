/**
 * Datos de salud de personas (Ley 1581 de 2012): en consultorios
 * odontológicos, clínicas y fisioterapia el motivo de consulta es un dato
 * sensible y solo se guarda con autorización expresa del paciente. Misma
 * lista que server/src/services/agent/safetyGuardrails.ts
 * (requiresHealthDataConsent); la base y el server son los que la hacen
 * cumplir, acá solo se usa para mostrar la casilla y los avisos.
 */
const HUMAN_HEALTH_TYPES = new Set(["dental", "clinic", "physiotherapy"]);

export function requiresHealthDataConsent(businessType: string | null | undefined): boolean {
  return !!businessType && HUMAN_HEALTH_TYPES.has(businessType);
}

export const HEALTH_CONSENT_LABEL =
  "Autorizo guardar el motivo de mi consulta (dato de salud) solo para gestionar la cita. Puedo pedir que lo borren cuando quiera.";

export const HEALTH_CONSENT_SOURCE_LABEL: Record<string, string> = {
  chat: "respondió SÍ en el chat",
  public_page: "marcó la casilla al reservar en línea",
  panel: "registrada por el equipo"
};

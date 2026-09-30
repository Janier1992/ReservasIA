// Guardrails de código (no solo instrucciones de prompt) para los nichos de
// salud/veterinaria. Un LLM puede ignorar una instrucción del system prompt;
// estas funciones son la red de seguridad determinística que corre SIEMPRE,
// sin depender de que el modelo "se acuerde" de la regla.

export const HEALTH_NICHE_TYPES = new Set(["dental", "clinic", "physiotherapy", "veterinary"]);

export function isHealthNiche(businessType: string): boolean {
  return HEALTH_NICHE_TYPES.has(businessType);
}

// Frases en el mensaje del CLIENTE que sugieren una emergencia real (humana
// o de una mascota). No es exhaustivo ni reemplaza criterio médico: es un
// segundo seguro además de la instrucción del prompt, para el caso en que el
// modelo no la respete. Preferimos algún falso positivo ocasional (agendar
// se demora un mensaje más) antes que dejar pasar una emergencia real.
const EMERGENCY_PATTERNS: RegExp[] = [
  /dolor (fuerte|intenso|muy fuerte)?.{0,15}pecho/i,
  /no (puedo|puede|pueden)\s*respirar/i,
  /dificultad (para |al )?respirar/i,
  /se (está|esta)?\s*ahogando/i,
  /convulsion/i,
  /perdi[oó] (el conocimiento|la conciencia)/i,
  /se desmay[oó]/i,
  /desmayad[oa]/i,
  /sangr\w*\s*(mucho|abundante|sin parar|no para)/i,
  /hemorragia/i,
  /atropell/i,
  /accidente (grave|fuerte)/i,
  /intoxicad[oa]/i,
  /envenenad[oa]/i,
  /se comi[oó]\s*(veneno|algo t[oó]xico)/i,
  /no (reacciona|responde|se mueve)/i,
  /convulsionando/i
];

export function detectEmergency(customerMessage: string): boolean {
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(customerMessage));
}

export const EMERGENCY_FALLBACK_REPLY =
  "Por lo que describís, esto podría ser una emergencia. No puedo agendarte un turno para esto: comunicate de inmediato con la línea de emergencias de tu zona o dirigite al servicio de urgencias más cercano.";

// Heurística de "esto suena a indicación clínica" (nombre de medicamento o
// patrón de dosis/frecuencia) — no es un parser clínico. El agente
// prácticamente nunca necesita nombrar un medicamento o una dosis para
// agendar un turno, así que cualquier coincidencia dispara el bloqueo.
const MEDICATION_NAMES = [
  "ibuprofeno",
  "acetaminofen",
  "acetaminofén",
  "paracetamol",
  "amoxicilina",
  "diclofenaco",
  "naproxeno",
  "aspirina",
  "omeprazol",
  "loratadina",
  "dexametasona",
  "prednisona",
  "azitromicina",
  "ciprofloxacino",
  "metronidazol",
  "tramadol"
];
const DOSAGE_PATTERN = /\b\d+\s?(mg|ml|mcg|g|gr)\b|\b\d+\s+(gotas|comprimidos?|pastillas?|tabletas?|capsulas?|cápsulas?)\b/i;
const FREQUENCY_PATTERN = /cada\s+\d+\s+horas|\b\d+\s+veces?\s+al\s+d[ií]a\b/i;

export function containsMedicalAdvice(agentReply: string): boolean {
  const lower = agentReply.toLowerCase();
  if (MEDICATION_NAMES.some((name) => lower.includes(name))) return true;
  return DOSAGE_PATTERN.test(agentReply) || FREQUENCY_PATTERN.test(agentReply);
}

export const MEDICAL_ADVICE_FALLBACK_REPLY =
  "Por tu seguridad no puedo recomendarte tratamientos ni medicamentos por acá — eso te lo confirma directamente el profesional en tu cita. ¿Querés que te ayude a agendar un turno?";

// Aviso automático (lo antepone el código, no el modelo) la primera vez que
// un negocio de salud/veterinaria conversa con un cliente en una
// conversación nueva — el motivo de consulta o los datos de una mascota que
// el agente anota son datos sensibles.
export const HEALTH_PRIVACY_NOTICE =
  "Antes de continuar: la información que compartas acá (motivo de la consulta u otros datos relacionados) se usa solo para gestionar tu turno, y únicamente el equipo del negocio puede verla.\n\n";

// Etiquetas y guía por rubro para el prompt del agente. La guía la escribe
// la plataforma (no el negocio), va después de las reglas críticas y nunca
// las contradice: solo agrega qué datos propios del rubro conviene anotar
// y qué límites de seguridad respetar (ej. no diagnosticar).
// functions/agent-preview.ts tiene una copia de esto (Deno no puede
// importar código del server): si cambiás algo acá, replicalo allá.

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurante",
  barbershop: "Barbería",
  beauty_salon: "Peluquería / Salón de belleza",
  spa: "Spa / Centro de estética",
  dental: "Consultorio odontológico",
  clinic: "Clínica / Consultorio médico",
  physiotherapy: "Fisioterapia / Rehabilitación",
  veterinary: "Veterinaria",
  auto_repair: "Taller mecánico",
  academy: "Academia / Clases",
  gym: "Gimnasio",
  studio: "Estudio",
  other: "Otro"
};

const HEALTH_EMERGENCY_RULE =
  "Si el cliente describe una emergencia (dolor en el pecho, dificultad para respirar, sangrado abundante, pérdida de conciencia, accidente grave), no la agendes como un turno normal: indicale que llame a la línea de emergencias o vaya a urgencias de inmediato.";

const BUSINESS_TYPE_GUIDANCE: Record<string, string[]> = {
  dental: [
    "Podés preguntar brevemente el motivo de la consulta y si es paciente nuevo, y anotarlo en el campo notas de crear_reserva.",
    "Si menciona dolor fuerte, inflamación o un diente roto, tratalo como prioridad: ofrecé el turno disponible más cercano (si existe un servicio de urgencia, usá ese) y, si no hay disponibilidad pronto, sugerile llamar directamente al consultorio.",
    "Nunca des diagnósticos, recomiendes medicamentos ni indicaciones clínicas: eso lo define solo el odontólogo en la consulta.",
    HEALTH_EMERGENCY_RULE
  ],
  clinic: [
    "Podés preguntar brevemente el motivo de la consulta y anotarlo en el campo notas de crear_reserva.",
    "Nunca des diagnósticos, recomiendes medicamentos ni indicaciones médicas: eso lo define solo el profesional en la consulta.",
    HEALTH_EMERGENCY_RULE
  ],
  physiotherapy: [
    "Podés preguntar la zona o el motivo (ej: rodilla, espalda, recuperación de una cirugía) y anotarlo en el campo notas de crear_reserva.",
    "Si es la primera vez del paciente y existe un servicio de valoración inicial, ofrecé ese primero.",
    "Nunca des diagnósticos, ejercicios ni indicaciones de tratamiento: eso lo define solo el fisioterapeuta.",
    HEALTH_EMERGENCY_RULE
  ],
  veterinary: [
    "El nombre del cliente es el del dueño o dueña. Pedí además el nombre de la mascota y la especie (perro, gato, etc.), y anotalos en el campo notas de crear_reserva junto con la raza o edad si el cliente las menciona.",
    "Si describe una emergencia de la mascota (atropello, envenenamiento, convulsiones, dificultad para respirar, sangrado), no la agendes como un turno normal: indicale que llame o vaya a la veterinaria de inmediato, o a una clínica veterinaria de urgencias.",
    "Nunca des diagnósticos ni recomiendes medicamentos o dosis: eso lo define solo el veterinario."
  ],
  auto_repair: [
    "Pedí la marca, el modelo y la placa del vehículo, y una breve descripción del problema o del servicio que necesita, y anotalo todo en el campo notas de crear_reserva.",
    "Nunca des diagnósticos mecánicos definitivos ni valores que no estén en la lista de servicios: el costo final lo define el taller después de revisar el vehículo."
  ],
  academy: [
    "Quien escribe puede no ser el estudiante (por ejemplo, una madre o un padre inscribiendo a su hijo o hija). Pedí el nombre del estudiante y, si aplica, su edad o nivel, y anotalo en el campo notas de crear_reserva.",
    "Si entre los servicios hay una clase de prueba, ofrecela a quien consulta por primera vez."
  ]
};

export function businessTypeLabel(value: string): string {
  return BUSINESS_TYPE_LABELS[value] ?? value;
}

export function businessTypeGuidance(value: string): string | null {
  const lines = BUSINESS_TYPE_GUIDANCE[value];
  if (!lines) return null;
  return lines.map((line) => `- ${line}`).join("\n");
}

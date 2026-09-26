export interface BusinessTypeServicePreset {
  name: string;
  duration_minutes: number;
}

export interface BusinessTypeDefinition {
  value: string;
  label: string;
  // Servicios típicos del rubro que el onboarding precarga (editables y
  // sin precio: cada negocio pone el suyo).
  suggestedServices: BusinessTypeServicePreset[];
  resourceExample: { name: string; type: string };
  // Rubros que suelen atender varias personas en el mismo horario (clases
  // grupales): el onboarding les ofrece configurar el cupo por horario.
  groupCapacityHint?: string;
}

export const BUSINESS_TYPES: BusinessTypeDefinition[] = [
  {
    value: "restaurant",
    label: "Restaurante",
    suggestedServices: [{ name: "Reserva de mesa", duration_minutes: 90 }],
    resourceExample: { name: "Mesa 1", type: "mesa" }
  },
  {
    value: "barbershop",
    label: "Barbería",
    suggestedServices: [
      { name: "Corte de cabello", duration_minutes: 30 },
      { name: "Corte + barba", duration_minutes: 45 },
      { name: "Arreglo de barba", duration_minutes: 20 }
    ],
    resourceExample: { name: "Barbero Juan", type: "barbero" }
  },
  {
    value: "beauty_salon",
    label: "Peluquería / Salón de belleza",
    suggestedServices: [
      { name: "Corte", duration_minutes: 45 },
      { name: "Tinte", duration_minutes: 120 },
      { name: "Manicure", duration_minutes: 45 },
      { name: "Pedicure", duration_minutes: 60 }
    ],
    resourceExample: { name: "Estilista Ana", type: "estilista" }
  },
  {
    value: "spa",
    label: "Spa / Centro de estética",
    suggestedServices: [
      { name: "Masaje relajante", duration_minutes: 60 },
      { name: "Limpieza facial", duration_minutes: 60 }
    ],
    resourceExample: { name: "Cabina 1", type: "cabina" }
  },
  {
    value: "dental",
    label: "Consultorio odontológico",
    suggestedServices: [
      { name: "Valoración / consulta inicial", duration_minutes: 30 },
      { name: "Limpieza dental (profilaxis)", duration_minutes: 45 },
      { name: "Resina / calza", duration_minutes: 60 },
      { name: "Blanqueamiento", duration_minutes: 60 },
      { name: "Urgencia odontológica", duration_minutes: 30 }
    ],
    resourceExample: { name: "Consultorio 1", type: "consultorio" }
  },
  {
    value: "clinic",
    label: "Clínica / Consultorio médico",
    suggestedServices: [
      { name: "Consulta general", duration_minutes: 30 },
      { name: "Control", duration_minutes: 20 }
    ],
    resourceExample: { name: "Dr. Gómez", type: "médico" }
  },
  {
    value: "physiotherapy",
    label: "Fisioterapia / Rehabilitación",
    suggestedServices: [
      { name: "Valoración inicial", duration_minutes: 60 },
      { name: "Sesión de fisioterapia", duration_minutes: 45 },
      { name: "Terapia deportiva", duration_minutes: 60 },
      { name: "Drenaje linfático", duration_minutes: 60 }
    ],
    resourceExample: { name: "Fisioterapeuta Laura", type: "fisioterapeuta" }
  },
  {
    value: "veterinary",
    label: "Veterinaria",
    suggestedServices: [
      { name: "Consulta general", duration_minutes: 30 },
      { name: "Vacunación", duration_minutes: 20 },
      { name: "Desparasitación", duration_minutes: 20 },
      { name: "Baño y peluquería", duration_minutes: 90 },
      { name: "Control posoperatorio", duration_minutes: 20 }
    ],
    resourceExample: { name: "Consultorio 1", type: "consultorio" }
  },
  {
    value: "auto_repair",
    label: "Taller mecánico",
    suggestedServices: [
      { name: "Diagnóstico general", duration_minutes: 60 },
      { name: "Cambio de aceite y filtros", duration_minutes: 45 },
      { name: "Revisión de frenos", duration_minutes: 90 },
      { name: "Alineación y balanceo", duration_minutes: 60 },
      { name: "Mantenimiento preventivo", duration_minutes: 120 }
    ],
    resourceExample: { name: "Bahía 1", type: "bahía" }
  },
  {
    value: "car_wash",
    label: "Lavadero de vehículos",
    suggestedServices: [
      { name: "Lavado exterior", duration_minutes: 30 },
      { name: "Lavado general (exterior + interior)", duration_minutes: 60 },
      { name: "Lavado de motor", duration_minutes: 30 },
      { name: "Lavado de moto", duration_minutes: 30 },
      { name: "Polichado / brillado", duration_minutes: 120 },
      { name: "Lavado de tapicería", duration_minutes: 180 }
    ],
    resourceExample: { name: "Bahía de lavado 1", type: "bahía" }
  },
  {
    value: "academy",
    label: "Academia / Clases",
    suggestedServices: [
      { name: "Clase de prueba", duration_minutes: 60 },
      { name: "Clase individual", duration_minutes: 60 },
      { name: "Clase grupal", duration_minutes: 90 }
    ],
    resourceExample: { name: "Profesor Carlos", type: "profesor" },
    groupCapacityHint:
      "Si dictás clases grupales, no agregues recursos: indicá abajo cuántos alumnos entran por horario. Agregá profesores como recursos solo si das clases individuales."
  },
  {
    value: "gym",
    label: "Gimnasio",
    suggestedServices: [
      { name: "Clase grupal", duration_minutes: 60 },
      { name: "Entrenamiento personalizado", duration_minutes: 60 }
    ],
    resourceExample: { name: "Entrenador Pedro", type: "entrenador" },
    groupCapacityHint:
      "Si tus clases son grupales, no agregues recursos: indicá abajo cuántas personas entran por horario."
  },
  {
    value: "studio",
    label: "Estudio",
    suggestedServices: [],
    resourceExample: { name: "Sala 1", type: "sala" }
  },
  {
    value: "other",
    label: "Otro",
    suggestedServices: [],
    resourceExample: { name: "Recurso 1", type: "recurso" }
  }
];

const OTHER = BUSINESS_TYPES[BUSINESS_TYPES.length - 1];

export function getBusinessType(value: string | null | undefined): BusinessTypeDefinition {
  return BUSINESS_TYPES.find((t) => t.value === value) ?? OTHER;
}

// Tipos viejos o cargados a mano que no están en el catálogo se muestran
// tal cual en vez de como "Otro", para no esconder el dato real.
export function businessTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value;
}

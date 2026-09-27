/**
 * Fichas por rubro (tabla customer_assets): qué se registra de lo que el
 * cliente trae o de a quién se atiende. La base guarda el tipo, un nombre
 * corto (`label`: la placa, el nombre de la mascota...) y los demás campos
 * en `attributes`; acá se define qué campos pide cada rubro.
 *
 * Los rubros de salud (odontología, clínica, fisioterapia) quedan afuera a
 * propósito: sus notas son datos sensibles (Ley 1581) y requieren
 * consentimiento y controles de acceso que esta ficha genérica no tiene.
 */

export type AssetType = "vehicle" | "pet" | "preferences" | "student";

export interface AssetField {
  key: string;
  label: string;
  kind: "text" | "number" | "date";
  placeholder?: string;
}

export interface AssetDefinition {
  type: AssetType;
  /** Nombre de la ficha en singular y plural ("Vehículo", "Vehículos"). */
  singular: string;
  plural: string;
  /** Rótulo del campo principal (se guarda en `label`). */
  labelTitle: string;
  labelPlaceholder: string;
  fields: AssetField[];
}

const VEHICLE: AssetDefinition = {
  type: "vehicle",
  singular: "Vehículo",
  plural: "Vehículos",
  labelTitle: "Placa",
  labelPlaceholder: "ABC123",
  fields: [
    { key: "brand", label: "Marca", kind: "text", placeholder: "Mazda" },
    { key: "model", label: "Modelo / línea", kind: "text", placeholder: "3 Touring" },
    { key: "year", label: "Año", kind: "number", placeholder: "2019" },
    { key: "color", label: "Color", kind: "text" },
    { key: "mileage", label: "Kilometraje", kind: "number", placeholder: "45000" }
  ]
};

const PET: AssetDefinition = {
  type: "pet",
  singular: "Mascota",
  plural: "Mascotas",
  labelTitle: "Nombre de la mascota",
  labelPlaceholder: "Luna",
  fields: [
    { key: "species", label: "Especie", kind: "text", placeholder: "Perro, gato..." },
    { key: "breed", label: "Raza", kind: "text" },
    { key: "birth_date", label: "Fecha de nacimiento", kind: "date" },
    { key: "weight_kg", label: "Peso (kg)", kind: "number" },
    { key: "next_vaccine", label: "Próxima vacuna", kind: "date" }
  ]
};

const BEAUTY_PREFERENCES: AssetDefinition = {
  type: "preferences",
  singular: "Ficha de preferencias",
  plural: "Preferencias",
  labelTitle: "Título",
  labelPlaceholder: "Preferencias",
  fields: [
    { key: "favorite_staff", label: "Profesional preferido", kind: "text" },
    { key: "color_formula", label: "Fórmula / color usado", kind: "text", placeholder: "Ej: 7.1 + oxidante 20 vol" },
    { key: "allergies", label: "Alergias o sensibilidades", kind: "text" }
  ]
};

const RESTAURANT_PREFERENCES: AssetDefinition = {
  type: "preferences",
  singular: "Ficha de preferencias",
  plural: "Preferencias",
  labelTitle: "Título",
  labelPlaceholder: "Preferencias",
  fields: [
    { key: "favorite_table", label: "Mesa o zona preferida", kind: "text", placeholder: "Terraza" },
    { key: "allergies", label: "Alergias o restricciones", kind: "text", placeholder: "Sin gluten, maní..." },
    { key: "special_date", label: "Fecha especial (cumpleaños, aniversario)", kind: "date" }
  ]
};

const STUDENT: AssetDefinition = {
  type: "student",
  singular: "Estudiante",
  plural: "Estudiantes",
  labelTitle: "Nombre del estudiante",
  labelPlaceholder: "Sofía",
  fields: [
    { key: "level", label: "Nivel", kind: "text", placeholder: "Básico, intermedio..." },
    { key: "birth_date", label: "Fecha de nacimiento", kind: "date" },
    { key: "guardian", label: "Acudiente", kind: "text" },
    { key: "guardian_phone", label: "Teléfono del acudiente", kind: "text" }
  ]
};

const GYM_MEMBER: AssetDefinition = {
  type: "student",
  singular: "Miembro",
  plural: "Miembros",
  labelTitle: "Nombre",
  labelPlaceholder: "Nombre del miembro",
  fields: [
    { key: "plan", label: "Plan", kind: "text", placeholder: "Mensual, trimestral..." },
    { key: "goal", label: "Objetivo", kind: "text", placeholder: "Bajar de peso, fuerza..." },
    { key: "start_date", label: "Fecha de inicio", kind: "date" }
  ]
};

const BY_BUSINESS_TYPE: Record<string, AssetDefinition> = {
  auto_repair: VEHICLE,
  car_wash: VEHICLE,
  veterinary: PET,
  barbershop: BEAUTY_PREFERENCES,
  beauty_salon: BEAUTY_PREFERENCES,
  spa: BEAUTY_PREFERENCES,
  restaurant: RESTAURANT_PREFERENCES,
  academy: STUDENT,
  gym: GYM_MEMBER
};

/** Ficha que usa el rubro, o null si el rubro no tiene fichas. */
export function getAssetDefinition(businessType: string | null | undefined): AssetDefinition | null {
  return (businessType && BY_BUSINESS_TYPE[businessType]) || null;
}

/** Normaliza una placa para mostrarla y compararla: mayúsculas, sin espacios. */
export function normalizePlate(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

/**
 * Convierte lo que el usuario tipeó en el formulario a lo que se guarda en
 * `attributes`: números como número, vacíos afuera (así la ficha no se llena
 * de claves vacías).
 */
export function buildAttributes(definition: AssetDefinition, values: Record<string, string>): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};
  for (const field of definition.fields) {
    const raw = (values[field.key] ?? "").trim();
    if (!raw) continue;
    if (field.kind === "number") {
      const n = Number(raw.replace(",", "."));
      if (Number.isFinite(n)) attributes[field.key] = n;
    } else {
      attributes[field.key] = raw;
    }
  }
  return attributes;
}

/** Resumen de una línea para listas: "Mazda 3 Touring · 45000 km". */
export function summarizeAsset(definition: AssetDefinition, attributes: Record<string, unknown>): string {
  return definition.fields
    .filter((f) => attributes[f.key] !== undefined && attributes[f.key] !== "")
    .slice(0, 3)
    .map((f) => (f.key === "mileage" ? `${attributes[f.key]} km` : String(attributes[f.key])))
    .join(" · ");
}

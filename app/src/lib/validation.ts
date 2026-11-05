// Helpers de validación livianos y compartidos. No reemplazan un formulario
// completo con react-hook-form/zod (varios formularios de la app todavía
// usan estado manual) — simplemente evitan que se puedan guardar valores
// claramente inválidos (NaN, negativos, emails mal escritos) desde esos
// formularios, sin reescribir su manejo de estado.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Enlace de mapa del negocio: solo https y de largo razonable (la base exige lo mismo). */
export function isValidMapsUrl(value: string): boolean {
  const url = value.trim();
  if (!url.startsWith("https://") || url.length > 500) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

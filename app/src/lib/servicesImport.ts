// Parser puro de la planilla de carga masiva de servicios: recibe las filas
// ya leídas del Excel (primera fila = encabezados) y devuelve las filas
// válidas y los errores por fila. Separado del diálogo para poder testearlo.

// Mismos campos que muestra la vista de Servicios: Nombre, Duración (min),
// Precio y Moneda. Los encabezados se aceptan sin importar mayúsculas/acentos
// para que una planilla exportada de otro sistema también sirva.
export const TEMPLATE_HEADERS = ["Nombre", "Duración (min)", "Precio", "Moneda"];

export interface ParsedRow {
  rowNumber: number;
  name: string;
  duration_minutes: number;
  price: number | null;
  currency: string;
}

export interface RowError {
  rowNumber: number;
  message: string;
}

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function normalizeHeader(header: string): string {
  return header.toString().trim().toLowerCase().normalize("NFD").replace(DIACRITICS_PATTERN, "");
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

export function parseServiceRows(sheet: readonly (readonly unknown[])[], defaultCurrency: string): { rows: ParsedRow[]; errors: RowError[] } {
  // Las filas vacías se descartan pero sin perder el número de fila real,
  // así los errores apuntan a la fila que el usuario ve en su Excel.
  const raw = sheet.map((line, index) => ({ line, rowNumber: index + 1 })).filter(({ line }) =>
    line.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
  );

  if (raw.length === 0) return { rows: [], errors: [] };

  const headers = raw[0].line.map((h) => String(h ?? ""));
  const nameCol = findColumn(headers, ["nombre", "servicio", "name"]);
  const durationCol = findColumn(headers, ["duracion (min)", "duracion", "duration_minutes", "duration"]);
  const priceCol = findColumn(headers, ["precio", "price"]);
  const currencyCol = findColumn(headers, ["moneda", "currency"]);

  if (nameCol === -1 || durationCol === -1) {
    return {
      rows: [],
      errors: [{ rowNumber: raw[0].rowNumber, message: 'El archivo debe tener al menos las columnas "Nombre" y "Duración (min)".' }]
    };
  }

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  for (const { line, rowNumber } of raw.slice(1)) {
    const name = String(line[nameCol] ?? "").trim();
    if (!name) continue;

    const durationRaw = line[durationCol];
    const duration_minutes = Number(durationRaw);
    if (!durationRaw || !Number.isFinite(duration_minutes) || duration_minutes <= 0) {
      errors.push({ rowNumber, message: `"${name}": la duración debe ser un número mayor a 0.` });
      continue;
    }

    let price: number | null = null;
    if (priceCol !== -1 && line[priceCol] !== undefined && line[priceCol] !== null && line[priceCol] !== "") {
      const priceValue = Number(line[priceCol]);
      if (!Number.isFinite(priceValue) || priceValue < 0) {
        errors.push({ rowNumber, message: `"${name}": el precio debe ser un número mayor o igual a 0.` });
        continue;
      }
      price = priceValue;
    }

    const currency = currencyCol !== -1 ? String(line[currencyCol] ?? "").trim().toUpperCase() : "";

    rows.push({
      rowNumber,
      name,
      duration_minutes: Math.round(duration_minutes),
      price,
      currency: currency || defaultCurrency
    });
  }

  return { rows, errors };
}

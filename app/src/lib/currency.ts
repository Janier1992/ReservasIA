export interface CurrencyOption {
  code: string;
  label: string;
}

// COP primero porque es el mercado principal de la plataforma hoy, pero el
// esquema (business_profiles.currency / services.currency) es texto libre
// para poder operar en otros países sin cambios de modelo.
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: "COP", label: "Peso colombiano (COP)" },
  { code: "USD", label: "Dólar estadounidense (USD)" },
  { code: "MXN", label: "Peso mexicano (MXN)" },
  { code: "ARS", label: "Peso argentino (ARS)" },
  { code: "PEN", label: "Sol peruano (PEN)" },
  { code: "CLP", label: "Peso chileno (CLP)" }
];

export const DEFAULT_CURRENCY = "COP";

export function formatCurrency(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency || DEFAULT_CURRENCY,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

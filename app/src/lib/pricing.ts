/**
 * Precios de ReservasIA (lo que el negocio le paga a la plataforma), en pesos
 * colombianos. Es la única fuente: la página de presentación y la tarjeta de
 * Suscripción del panel leen de acá, así nunca muestran valores distintos.
 *
 * Esquema:
 * - Prueba gratis de TRIAL_DAYS días, sin tarjeta.
 * - Plan mensual: mensualidad + activación (pago único), que se puede pagar
 *   completa o repartida en ACTIVATION_INSTALLMENTS cuotas junto con las
 *   primeras mensualidades.
 * - Plan anual: un pago por 12 meses, sin activación.
 *
 * Hay dos planes con ese mismo esquema:
 * - Completo: el panel más el agente de IA en WhatsApp y Telegram.
 * - Gestión: solo el panel, para negocios que cargan a mano sus reservas,
 *   atenciones y ventas. Sin agente no hay costo de modelo ni de mensajes,
 *   y la puesta en marcha es más corta, por eso cuesta menos.
 */

/** Días de prueba gratis al registrarse (igual que public.signup_trial_days() en la base). */
export const TRIAL_DAYS = 14;

export const MONTHLY_PRICE_COP = 150_000;
export const ACTIVATION_PRICE_COP = 390_000;
export const ACTIVATION_INSTALLMENTS = 3;
export const ACTIVATION_INSTALLMENT_COP = ACTIVATION_PRICE_COP / ACTIVATION_INSTALLMENTS;
export const ANNUAL_PRICE_COP = 1_500_000;

/** Plan Gestión (sin agente): activación de un solo pago, sin cuotas. */
export const MANAGEMENT_MONTHLY_PRICE_COP = 69_000;
export const MANAGEMENT_ACTIVATION_PRICE_COP = 120_000;
export const MANAGEMENT_ANNUAL_PRICE_COP = 690_000;
export const MANAGEMENT_ANNUAL_MONTHLY_EQUIVALENT_COP = Math.round(MANAGEMENT_ANNUAL_PRICE_COP / 12);
/** Lo que paga de activación quien pasa del plan Gestión al Completo. */
export const UPGRADE_ACTIVATION_DIFFERENCE_COP = ACTIVATION_PRICE_COP - MANAGEMENT_ACTIVATION_PRICE_COP;

/** Lo que cuesta al mes el plan anual, para compararlo con el mensual. */
export const ANNUAL_MONTHLY_EQUIVALENT_COP = Math.round(ANNUAL_PRICE_COP / 12);
/** Meses que se ahorran con el plan anual frente a 12 mensualidades. */
export const ANNUAL_FREE_MONTHS = Math.round((MONTHLY_PRICE_COP * 12 - ANNUAL_PRICE_COP) / MONTHLY_PRICE_COP);

export const formatCop = (value: number) => `$${value.toLocaleString("es-CO")}`;

/**
 * Los precios se publican antes de IVA ("+ IVA"): el negocio paga el valor
 * más el 19 %. El panel le muestra el total ya calculado para que no tenga
 * que hacer cuentas.
 */
export const VAT_RATE = 0.19;
export const VAT_PERCENT_LABEL = `${Math.round(VAT_RATE * 100)} %`;

/** Valor con IVA, redondeado al peso. */
export function withVat(value: number): number {
  return Math.round(value * (1 + VAT_RATE));
}

/** Lo que el negocio puede estar pagando cuando reporta un comprobante. */
export type PlanId = "complete" | "management";

export const PLAN_NAMES: Record<PlanId, string> = {
  complete: "Plan Completo (con agente de IA)",
  management: "Plan Gestión (sin agente)"
};

export interface PaymentOption {
  id:
    | "monthly_with_installment"
    | "monthly_with_full_activation"
    | "monthly"
    | "annual"
    | "management_monthly_with_activation"
    | "management_monthly"
    | "management_annual"
    | "upgrade_to_complete";
  plan: PlanId;
  label: string;
  detail: string;
  amount: number;
  /** Meses de servicio que suma el pago al confirmarlo. */
  months: 1 | 12;
}

export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "monthly_with_installment",
    label: "Mensualidad + cuota de activación",
    detail: `Para los primeros ${ACTIVATION_INSTALLMENTS} meses: ${formatCop(MONTHLY_PRICE_COP)} + ${formatCop(ACTIVATION_INSTALLMENT_COP)} + IVA.`,
    amount: MONTHLY_PRICE_COP + ACTIVATION_INSTALLMENT_COP,
    plan: "complete",
    months: 1
  },
  {
    id: "monthly_with_full_activation",
    label: "Mensualidad + activación completa",
    detail: "Pagás la activación de una vez y desde el mes siguiente solo la mensualidad.",
    amount: MONTHLY_PRICE_COP + ACTIVATION_PRICE_COP,
    plan: "complete",
    months: 1
  },
  {
    id: "monthly",
    label: "Mensualidad",
    detail: "Cuando la activación ya está paga.",
    amount: MONTHLY_PRICE_COP,
    plan: "complete",
    months: 1
  },
  {
    id: "annual",
    label: "Plan anual",
    detail: `12 meses de servicio, sin activación (${ANNUAL_FREE_MONTHS} meses gratis).`,
    amount: ANNUAL_PRICE_COP,
    plan: "complete",
    months: 12
  },
  {
    id: "upgrade_to_complete",
    label: "Pasar del plan Gestión al Completo",
    detail: `Mensualidad del plan Completo + la diferencia de activación (${formatCop(UPGRADE_ACTIVATION_DIFFERENCE_COP)}).`,
    amount: MONTHLY_PRICE_COP + UPGRADE_ACTIVATION_DIFFERENCE_COP,
    plan: "complete",
    months: 1
  },
  {
    id: "management_monthly_with_activation",
    label: "Mensualidad + activación",
    detail: "El primer mes: la activación se paga una sola vez.",
    amount: MANAGEMENT_MONTHLY_PRICE_COP + MANAGEMENT_ACTIVATION_PRICE_COP,
    plan: "management",
    months: 1
  },
  {
    id: "management_monthly",
    label: "Mensualidad",
    detail: "Cuando la activación ya está paga.",
    amount: MANAGEMENT_MONTHLY_PRICE_COP,
    plan: "management",
    months: 1
  },
  {
    id: "management_annual",
    label: "Plan anual",
    detail: "12 meses de servicio, sin activación (2 meses gratis).",
    amount: MANAGEMENT_ANNUAL_PRICE_COP,
    plan: "management",
    months: 12
  }
];

/** Texto que acompaña al pago reportado para que soporte sepa qué se pagó. */
export function paymentOptionNote(option: PaymentOption): string {
  const plan = option.plan === "management" ? "Plan Gestión · " : "";
  return `${plan}${option.label} (${option.months === 12 ? "12 meses" : "1 mes"})`;
}

/** Meses a sumar según la nota de un pago reportado (los pagos viejos, sin plan, son de 1 mes). */
export function monthsFromPaymentNote(note: string | null | undefined): 1 | 12 {
  return note?.includes("(12 meses)") ? 12 : 1;
}

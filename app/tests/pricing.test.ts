import { describe, expect, it } from "vitest";
import {
  ACTIVATION_INSTALLMENTS,
  ACTIVATION_INSTALLMENT_COP,
  ACTIVATION_PRICE_COP,
  ANNUAL_FREE_MONTHS,
  ANNUAL_PRICE_COP,
  MANAGEMENT_ACTIVATION_PRICE_COP,
  MANAGEMENT_ANNUAL_PRICE_COP,
  MANAGEMENT_MONTHLY_PRICE_COP,
  MONTHLY_PRICE_COP,
  PAYMENT_OPTIONS,
  UPGRADE_ACTIVATION_DIFFERENCE_COP,
  formatCop,
  monthsFromPaymentNote,
  paymentOptionNote,
  withVat
} from "@/lib/pricing";

describe("precios de la suscripción", () => {
  it("las cuotas de la activación son en pesos enteros y suman la activación", () => {
    expect(Number.isInteger(ACTIVATION_INSTALLMENT_COP)).toBe(true);
    expect(ACTIVATION_INSTALLMENT_COP * ACTIVATION_INSTALLMENTS).toBe(ACTIVATION_PRICE_COP);
  });

  it("el plan anual sale más barato que 12 mensualidades y cuenta bien los meses gratis", () => {
    expect(ANNUAL_PRICE_COP).toBeLessThan(MONTHLY_PRICE_COP * 12);
    expect(ANNUAL_PRICE_COP + ANNUAL_FREE_MONTHS * MONTHLY_PRICE_COP).toBe(MONTHLY_PRICE_COP * 12);
  });

  it("el plan Gestión cuesta menos que el Completo, su anual regala 2 meses y el cambio de plan cobra la diferencia", () => {
    expect(MANAGEMENT_MONTHLY_PRICE_COP).toBeLessThan(MONTHLY_PRICE_COP);
    expect(MANAGEMENT_ANNUAL_PRICE_COP).toBe(MANAGEMENT_MONTHLY_PRICE_COP * 10);
    expect(MANAGEMENT_ACTIVATION_PRICE_COP + UPGRADE_ACTIVATION_DIFFERENCE_COP).toBe(ACTIVATION_PRICE_COP);
    expect(PAYMENT_OPTIONS.filter((o) => o.plan === "management").length).toBeGreaterThan(0);
  });

  it("la nota de un pago del plan Gestión lo deja claro para soporte", () => {
    const option = PAYMENT_OPTIONS.find((o) => o.id === "management_annual")!;
    expect(paymentOptionNote(option)).toBe("Plan Gestión · Plan anual (12 meses)");
  });

  it("formatea en pesos colombianos", () => {
    expect(formatCop(1_500_000)).toBe("$1.500.000");
  });

  it("la nota de cada opción le dice a soporte cuántos meses confirmar", () => {
    for (const option of PAYMENT_OPTIONS) {
      expect(monthsFromPaymentNote(`${paymentOptionNote(option)} · pagado desde Nequi de Ana`)).toBe(option.months);
    }
    expect(PAYMENT_OPTIONS.find((o) => o.id === "annual")?.months).toBe(12);
  });

  it("los pagos viejos, sin plan en la nota, siguen sumando un mes", () => {
    expect(monthsFromPaymentNote(null)).toBe(1);
    expect(monthsFromPaymentNote("pago de octubre")).toBe(1);
  });

  it("suma el IVA del 19 % redondeado al peso", () => {
    expect(withVat(MONTHLY_PRICE_COP)).toBe(178_500);
    expect(withVat(MONTHLY_PRICE_COP + ACTIVATION_INSTALLMENT_COP)).toBe(333_200);
    expect(withVat(ANNUAL_PRICE_COP)).toBe(1_785_000);
  });
});

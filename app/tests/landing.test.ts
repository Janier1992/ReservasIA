import { describe, expect, it } from "vitest";
import { estimateMonthlyLoss, salesToCoverPlan } from "@/pages/public/LossCalculator";
import { onlyPublicPages } from "@/lib/analytics";

describe("calculadora de la página de presentación", () => {
  it("estima la pérdida del mes con los valores del visitante", () => {
    // 15 mensajes/día × 30 días × 20 % × $35.000
    expect(estimateMonthlyLoss(15, 20, 35_000)).toBe(3_150_000);
  });

  it("dice cuántas ventas pagan la mensualidad con IVA ($178.500)", () => {
    expect(salesToCoverPlan(35_000)).toBe(6);
    expect(salesToCoverPlan(300_000)).toBe(1);
  });
});

describe("medición de visitas", () => {
  const event = (url: string) => ({ type: "pageview" as const, url });

  it("cuenta las páginas públicas", () => {
    for (const path of ["/", "/login", "/register", "/privacidad", "/terminos", "/register/"]) {
      expect(onlyPublicPages(event(`https://reservas-ia-app.vercel.app${path}`))).not.toBeNull();
    }
  });

  it("nunca manda lo que pasa dentro del panel ni las páginas de cada negocio", () => {
    for (const path of ["/dashboard", "/dashboard/customers/1234", "/soporte/negocios/abc", "/r/barberia-el-corte"]) {
      expect(onlyPublicPages(event(`https://reservas-ia-app.vercel.app${path}`))).toBeNull();
    }
  });
});

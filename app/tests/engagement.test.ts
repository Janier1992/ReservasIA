import { describe, expect, it } from "vitest";
import {
  fillReactivationTemplate,
  DEFAULT_REACTIVATION_TEMPLATE,
  ratingStats,
  sinceLabel,
  surveyMessage,
  surveyUrl,
  whatsappLink,
  whatsappNumber
} from "@/lib/engagement";

describe("whatsapp links", () => {
  it("agrega el indicativo de Colombia a los celulares de 10 dígitos y omite a los clientes de Telegram", () => {
    expect(whatsappNumber("300 123 4567")).toBe("573001234567");
    expect(whatsappNumber("+57 300 123 4567")).toBe("573001234567");
    expect(whatsappNumber("+52 55 1234 5678")).toBe("525512345678");
    expect(whatsappNumber("telegram:123456")).toBeNull();
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappLink("3001234567", "Hola & chao")).toBe("https://wa.me/573001234567?text=Hola%20%26%20chao");
  });
});

describe("messages", () => {
  it("arma el mensaje de la encuesta con el primer nombre y el enlace", () => {
    const url = surveyUrl("a".repeat(64), "https://app.test");
    expect(url).toBe(`https://app.test/o/${"a".repeat(64)}`);
    expect(surveyMessage("Marta Ruiz", "Barbería Z", url)).toBe(`Hola Marta, gracias por visitarnos en Barbería Z. ¿Nos contás cómo te fue? Son 10 segundos: ${url}`);
    expect(surveyMessage(null, "Barbería Z", url)).toMatch(/^Hola, gracias/);
  });

  it("completa la plantilla de recuperación de clientes", () => {
    expect(fillReactivationTemplate(DEFAULT_REACTIVATION_TEMPLATE, "Ana Gómez", "Spa Luz")).toMatch(/^Hola Ana, te extrañamos en Spa Luz\./);
    expect(fillReactivationTemplate(DEFAULT_REACTIVATION_TEMPLATE, "", "Spa Luz")).toMatch(/^Hola, te extrañamos/);
  });
});

describe("ratingStats", () => {
  it("calcula el promedio, la tasa de respuesta y los promotores", () => {
    const s = ratingStats([{ rating: 5 }, { rating: 4 }, { rating: 2 }, { rating: null }]);
    expect(s).toMatchObject({ sent: 4, answered: 3, responseRate: 75, average: 3.7, promoters: 2, detractors: 1 });
    expect(ratingStats([]).average).toBeNull();
  });
});

describe("sinceLabel", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  it("uses days, then months", () => {
    expect(sinceLabel("2026-08-06T12:00:00Z", now)).toBe("hace 52 días");
    expect(sinceLabel("2026-05-27T12:00:00Z", now)).toBe("hace 4 meses");
    expect(sinceLabel("2025-01-01T12:00:00Z", now)).toBe("hace más de un año");
  });
});

describe("requiresHealthDataConsent", () => {
  it("pide autorización de datos de salud solo en los rubros de salud humana", async () => {
    const { requiresHealthDataConsent } = await import("@/lib/healthData");
    for (const t of ["dental", "clinic", "physiotherapy"]) expect(requiresHealthDataConsent(t)).toBe(true);
    for (const t of ["veterinary", "restaurant", null, undefined]) expect(requiresHealthDataConsent(t)).toBe(false);
  });
});

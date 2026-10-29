import { describe, expect, it } from "vitest";
import { isNonNegativeNumber, isPositiveInteger, isValidEmail, isValidMapsUrl } from "@/lib/validation";

describe("isValidEmail", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("cliente@negocio.com")).toBe(true);
    expect(isValidEmail("  cliente@negocio.com  ")).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(isValidEmail("no-es-un-email")).toBe(false);
    expect(isValidEmail("falta-arroba.com")).toBe(false);
    expect(isValidEmail("sin-dominio@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isNonNegativeNumber", () => {
  it("acepta cero y números finitos positivos", () => {
    expect(isNonNegativeNumber(0)).toBe(true);
    expect(isNonNegativeNumber(35000)).toBe(true);
  });

  it("rechaza números negativos y NaN", () => {
    expect(isNonNegativeNumber(-1)).toBe(false);
    expect(isNonNegativeNumber(Number.NaN)).toBe(false);
    expect(isNonNegativeNumber(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("isPositiveInteger", () => {
  it("accepts positive integers", () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(60)).toBe(true);
  });

  it("rechaza cero, negativos, decimales y NaN", () => {
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(-5)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger(Number.NaN)).toBe(false);
  });
});

describe("isValidMapsUrl", () => {
  it("acepta el enlace que se copia desde Compartir en Google Maps", () => {
    expect(isValidMapsUrl("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isValidMapsUrl("  https://www.google.com/maps/place/Barber%C3%ADa  ")).toBe(true);
  });

  it("rechaza lo que no es un enlace https", () => {
    expect(isValidMapsUrl("maps.app.goo.gl/abc")).toBe(false);
    expect(isValidMapsUrl("http://maps.app.goo.gl/abc")).toBe(false);
    expect(isValidMapsUrl("javascript:alert(1)")).toBe(false);
    expect(isValidMapsUrl(`https://${"a".repeat(500)}.com`)).toBe(false);
  });
});

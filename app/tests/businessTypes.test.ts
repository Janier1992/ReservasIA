import { describe, expect, it } from "vitest";
import { BUSINESS_TYPES, businessTypeLabel, getBusinessType } from "@/lib/businessTypes";

const NEW_NICHES = ["dental", "veterinary", "physiotherapy", "auto_repair", "car_wash", "academy"];

describe("catálogo de rubros", () => {
  it("incluye cada rubro nuevo con servicios sugeridos para el alta", () => {
    for (const value of NEW_NICHES) {
      const type = BUSINESS_TYPES.find((t) => t.value === value);
      expect(type, value).toBeDefined();
      expect(type!.suggestedServices.length).toBeGreaterThan(0);
    }
  });

  it("tiene valores únicos y solo duraciones de servicio positivas", () => {
    const values = BUSINESS_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
    for (const type of BUSINESS_TYPES) {
      for (const service of type.suggestedServices) {
        expect(service.duration_minutes).toBeGreaterThan(0);
      }
    }
  });

  it("ofrece cupo grupal a las academias, donde las clases suelen ser compartidas", () => {
    expect(getBusinessType("academy").groupCapacityHint).toBeTruthy();
  });

  it("usa 'Otro' para un tipo desconocido al elegir servicios sugeridos", () => {
    expect(getBusinessType("floristeria").value).toBe("other");
  });
});

describe("businessTypeLabel", () => {
  it("traduce al español los tipos conocidos", () => {
    expect(businessTypeLabel("auto_repair")).toBe("Taller mecánico");
  });

  it("muestra los tipos desconocidos tal cual en vez de esconderlos detrás de 'Otro'", () => {
    expect(businessTypeLabel("floristeria")).toBe("floristeria");
  });
});

import { describe, expect, it } from "vitest";
import { BUSINESS_TYPES, businessTypeLabel, getBusinessType } from "@/lib/businessTypes";

const NEW_NICHES = ["dental", "veterinary", "physiotherapy", "auto_repair", "car_wash", "academy"];

describe("business type catalog", () => {
  it("includes every new niche with suggested services for the onboarding", () => {
    for (const value of NEW_NICHES) {
      const type = BUSINESS_TYPES.find((t) => t.value === value);
      expect(type, value).toBeDefined();
      expect(type!.suggestedServices.length).toBeGreaterThan(0);
    }
  });

  it("has unique values and only positive service durations", () => {
    const values = BUSINESS_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
    for (const type of BUSINESS_TYPES) {
      for (const service of type.suggestedServices) {
        expect(service.duration_minutes).toBeGreaterThan(0);
      }
    }
  });

  it("offers group capacity to academies, where classes are usually shared", () => {
    expect(getBusinessType("academy").groupCapacityHint).toBeTruthy();
  });

  it("falls back to 'Otro' for an unknown type when picking presets", () => {
    expect(getBusinessType("floristeria").value).toBe("other");
  });
});

describe("businessTypeLabel", () => {
  it("translates known types to Spanish", () => {
    expect(businessTypeLabel("auto_repair")).toBe("Taller mecánico");
  });

  it("shows unknown types as-is instead of hiding them behind 'Otro'", () => {
    expect(businessTypeLabel("floristeria")).toBe("floristeria");
  });
});

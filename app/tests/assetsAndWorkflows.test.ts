import { describe, expect, it } from "vitest";
import { buildAttributes, getAssetDefinition, normalizePlate, summarizeAsset } from "@/lib/assetTypes";
import { adjacentStage, boardReservations, currentStage, fillNotifyMessage, getWorkflow } from "@/lib/workflows";
import { upcomingDates } from "@/lib/publicBookingUtils";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

describe("asset definitions", () => {
  it("gives vehicles to garages and car washes, pets to vets and nothing to health niches", () => {
    expect(getAssetDefinition("auto_repair")?.type).toBe("vehicle");
    expect(getAssetDefinition("car_wash")?.type).toBe("vehicle");
    expect(getAssetDefinition("veterinary")?.type).toBe("pet");
    for (const health of ["dental", "clinic", "physiotherapy"]) expect(getAssetDefinition(health)).toBeNull();
  });

  it("stores numbers as numbers and drops empty fields", () => {
    const def = getAssetDefinition("auto_repair")!;
    expect(buildAttributes(def, { brand: " Mazda ", year: "2019", mileage: "45,5", color: "" })).toEqual({ brand: "Mazda", year: 2019, mileage: 45.5 });
  });

  it("normalizes plates and summarizes a vehicle in one line", () => {
    expect(normalizePlate(" abc 123 ")).toBe("ABC123");
    const def = getAssetDefinition("car_wash")!;
    expect(summarizeAsset(def, { brand: "Mazda", model: "3", mileage: 45000 })).toBe("Mazda · 3 · 45000 km");
  });

  it("uses only stage keys the database accepts", () => {
    for (const type of BUSINESS_TYPES) {
      for (const stage of getWorkflow(type.value)?.stages ?? []) expect(stage.key).toMatch(/^[a-z_]{1,40}$/);
    }
  });
});

describe("workflows", () => {
  const garage = getWorkflow("auto_repair")!;

  it("treats a reservation without stage as the first stage and moves between stages", () => {
    expect(currentStage(garage, null).key).toBe("received");
    expect(adjacentStage(garage, "received", 1)?.key).toBe("diagnosis");
    expect(adjacentStage(garage, "received", -1)).toBeNull();
    expect(adjacentStage(garage, "ready", 1)).toBeNull();
  });

  it("has no workflow for niches that only use reservation status", () => {
    expect(getWorkflow("barbershop")).toBeNull();
  });

  it("fills the ready message with the first name and business", () => {
    expect(fillNotifyMessage(garage.notifyMessage!, "Carlos Ruiz", "Taller El Pistón")).toBe(
      "Hola Carlos, tu vehículo ya está listo para entregar en Taller El Pistón. ¡Te esperamos!"
    );
    expect(fillNotifyMessage(garage.notifyMessage!, null, "Taller")).toMatch(/^Hola, tu vehículo/);
  });
});

describe("boardReservations", () => {
  const garage = getWorkflow("auto_repair")!;
  const now = new Date("2026-09-27T15:00:00");
  const r = (start_at: string, stage: string | null, status = "confirmed") => ({ id: start_at + stage, status, start_at, stage });

  it("shows today and the coming week, plus older work still in progress, and hides stale or closed ones", () => {
    const items = [
      r("2026-09-27T18:00:00", null), // hoy
      r("2026-10-02T09:00:00", null), // dentro de la semana
      r("2026-10-20T09:00:00", null), // muy lejos
      r("2026-09-20T09:00:00", null), // vieja, nunca se movió
      r("2026-09-24T09:00:00", "in_progress"), // vieja pero en reparación
      r("2026-09-27T10:00:00", null, "completed") // cerrada
    ];
    expect(boardReservations(garage, items, now).map((x) => x.start_at)).toEqual([
      "2026-09-27T18:00:00",
      "2026-10-02T09:00:00",
      "2026-09-24T09:00:00"
    ]);
  });
});

describe("upcomingDates", () => {
  it("lists days in the business's timezone starting today", () => {
    // 02:00 UTC del 27 = 21:00 del 26 en Bogotá.
    expect(upcomingDates("America/Bogota", 3, new Date("2026-09-27T02:00:00Z"))).toEqual(["2026-09-26", "2026-09-27", "2026-09-28"]);
  });
});

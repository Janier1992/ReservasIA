import { describe, expect, it } from "vitest";
import { buildAttributes, getAssetDefinition, normalizePlate, summarizeAsset } from "@/lib/assetTypes";
import { adjacentStage, boardReservations, currentStage, fillNotifyMessage, getWorkflow } from "@/lib/workflows";
import { upcomingDates } from "@/lib/publicBookingUtils";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

describe("definiciones de activos por rubro", () => {
  it("asigna vehículos a talleres y lavaderos, mascotas a veterinarias y nada a los rubros de salud", () => {
    expect(getAssetDefinition("auto_repair")?.type).toBe("vehicle");
    expect(getAssetDefinition("car_wash")?.type).toBe("vehicle");
    expect(getAssetDefinition("veterinary")?.type).toBe("pet");
    for (const health of ["dental", "clinic", "physiotherapy"]) expect(getAssetDefinition(health)).toBeNull();
  });

  it("guarda los números como números y descarta los campos vacíos", () => {
    const def = getAssetDefinition("auto_repair")!;
    expect(buildAttributes(def, { brand: " Mazda ", year: "2019", mileage: "45,5", color: "" })).toEqual({ brand: "Mazda", year: 2019, mileage: 45.5 });
  });

  it("normaliza las placas y resume un vehículo en una línea", () => {
    expect(normalizePlate(" abc 123 ")).toBe("ABC123");
    const def = getAssetDefinition("car_wash")!;
    expect(summarizeAsset(def, { brand: "Mazda", model: "3", mileage: 45000 })).toBe("Mazda · 3 · 45000 km");
  });

  it("usa solo claves de etapa que la base acepta", () => {
    for (const type of BUSINESS_TYPES) {
      for (const stage of getWorkflow(type.value)?.stages ?? []) expect(stage.key).toMatch(/^[a-z_]{1,40}$/);
    }
  });
});

describe("flujos de trabajo", () => {
  const garage = getWorkflow("auto_repair")!;

  it("trata una reserva sin etapa como la primera etapa y la mueve entre etapas", () => {
    expect(currentStage(garage, null).key).toBe("received");
    expect(adjacentStage(garage, "received", 1)?.key).toBe("diagnosis");
    expect(adjacentStage(garage, "received", -1)).toBeNull();
    expect(adjacentStage(garage, "ready", 1)).toBeNull();
  });

  it("no tiene flujo de etapas para los rubros que solo usan el estado de la reserva", () => {
    expect(getWorkflow("barbershop")).toBeNull();
  });

  it("completa el mensaje de listo con el primer nombre y el negocio", () => {
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

  it("muestra hoy y la próxima semana, más los trabajos anteriores aún en curso, y oculta los viejos o cerrados", () => {
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
  it("lista los días en la zona horaria del negocio empezando por hoy", () => {
    // 02:00 UTC del 27 = 21:00 del 26 en Bogotá.
    expect(upcomingDates("America/Bogota", 3, new Date("2026-09-27T02:00:00Z"))).toEqual(["2026-09-26", "2026-09-27", "2026-09-28"]);
  });
});

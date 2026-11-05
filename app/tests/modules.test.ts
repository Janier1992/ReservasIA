import { describe, expect, it } from "vitest";
import { isModuleEnabled, toggleModule } from "@/lib/modules";

describe("módulos", () => {
  it("trata todos los módulos como activos cuando no se apagó ninguno", () => {
    expect(isModuleEnabled([], "inbox")).toBe(true);
    expect(isModuleEnabled(null, "team")).toBe(true);
  });

  it("informa un módulo apagado como apagado", () => {
    expect(isModuleEnabled(["team"], "team")).toBe(false);
    expect(isModuleEnabled(["team"], "inbox")).toBe(true);
  });

  it("agrega y quita un módulo de la lista de apagados sin duplicados", () => {
    expect(toggleModule([], "team", false)).toEqual(["team"]);
    expect(toggleModule(["team"], "team", false)).toEqual(["team"]);
    expect(toggleModule(["team", "inbox"], "team", true)).toEqual(["inbox"]);
  });

  it("mantiene un orden estable y conserva las claves que esta versión no conoce", () => {
    expect(toggleModule(["team", "future_module"], "inbox", false)).toEqual(["inbox", "team", "future_module"]);
  });
});

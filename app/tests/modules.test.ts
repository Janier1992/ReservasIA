import { describe, expect, it } from "vitest";
import { isModuleEnabled, toggleModule } from "@/lib/modules";

describe("modules", () => {
  it("treats every module as enabled when nothing was disabled", () => {
    expect(isModuleEnabled([], "inbox")).toBe(true);
    expect(isModuleEnabled(null, "team")).toBe(true);
  });

  it("reports a disabled module as off", () => {
    expect(isModuleEnabled(["team"], "team")).toBe(false);
    expect(isModuleEnabled(["team"], "inbox")).toBe(true);
  });

  it("adds and removes a module from the disabled list without duplicates", () => {
    expect(toggleModule([], "team", false)).toEqual(["team"]);
    expect(toggleModule(["team"], "team", false)).toEqual(["team"]);
    expect(toggleModule(["team", "inbox"], "team", true)).toEqual(["inbox"]);
  });

  it("keeps a stable order and preserves keys this version does not know", () => {
    expect(toggleModule(["team", "future_module"], "inbox", false)).toEqual(["inbox", "team", "future_module"]);
  });
});

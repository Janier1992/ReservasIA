import { describe, expect, it } from "vitest";

/**
 * Qué Edge Functions vuelve a publicar el workflow "Deploy Edge Functions"
 * según los archivos que cambiaron en un push (scripts/function-bundle.mjs).
 * Usa las funciones reales de functions/.
 */

const { affectedFunctions, listFunctions } = (await import("../../../scripts/function-bundle.mjs")) as {
  affectedFunctions: (functionsDir: string, changedFiles: string[]) => Promise<string[]>;
  listFunctions: (functionsDir: string) => string[];
};

const FUNCTIONS_DIR = new URL("../../../functions", import.meta.url).pathname;
const affected = (...files: string[]) => affectedFunctions(FUNCTIONS_DIR, files);

describe("funciones a publicar en cada push", () => {
  it("el código compartido de functions/_shared no es una función", () => {
    const functions = listFunctions(FUNCTIONS_DIR);
    expect(functions).toContain("conversations-reply");
    expect(functions.some((name) => name.includes("credentialsCrypto") || name.startsWith("_"))).toBe(false);
  });

  it("si cambia functions/_shared, publica todas las funciones que lo usan", async () => {
    expect(await affected("functions/_shared/credentialsCrypto.ts")).toEqual([
      "conversations-reply",
      "google-disconnect",
      "ycloud-connect",
      "ycloud-disconnect"
    ]);
  });

  it("si cambian las instrucciones del agente en el server, publica la vista previa", async () => {
    expect(await affected("server/src/services/agent/coreRules.ts")).toEqual(["agent-preview"]);
    expect(await affected("server/src/utils/location.ts")).toEqual(["agent-preview"]);
  });

  it("publica solo la función cuyo archivo cambió, y nada si el cambio no toca ninguna", async () => {
    expect(await affected("functions/voice-intake.ts", "README.md")).toEqual(["voice-intake"]);
    expect(await affected("README.md", "app/src/App.tsx", "server/src/routes/public.ts")).toEqual([]);
  });

  it("una función borrada en el push no se intenta publicar", async () => {
    expect(await affected("functions/twilio-connect.ts")).toEqual([]);
  });
});

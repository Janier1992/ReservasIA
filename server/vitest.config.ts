import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = (file: string) => fileURLToPath(new URL(`./tests/functions/stubs/${file}`, import.meta.url));

export default defineConfig({
  // Las Edge Functions de ../functions importan con especificadores de Deno
  // ("npm:..."). En los tests se resuelven a dobles (tests/functions/stubs)
  // o a la misma librería instalada en el monorepo.
  resolve: {
    alias: {
      "npm:@insforge/sdk": stub("fakeInsforge.ts"),
      "npm:twilio": stub("anyModule.ts"),
      "npm:openai": stub("anyModule.ts"),
      "npm:googleapis": stub("anyModule.ts"),
      "npm:date-fns-tz": "date-fns-tz",
      "npm:date-fns": "date-fns"
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    reporters: "default"
  }
});

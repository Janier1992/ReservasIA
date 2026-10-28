import { defineConfig } from "@playwright/test";

/**
 * Pruebas de punta a punta de la app compilada (npm run build) en un
 * navegador real. El servidor y InsForge se simulan en cada prueba
 * (page.route), así que no tocan datos reales. La compilación tiene que
 * usar las direcciones de e2e/fixtures.ts:
 *
 *   VITE_API_URL=https://api.e2e.test VITE_INSFORGE_URL=https://insforge.e2e.test \
 *   VITE_INSFORGE_ANON_KEY=e2e npm run build && npm run e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    locale: "es-CO",
    timezoneId: "America/Bogota",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    // En entornos con Chromium preinstalado en otra ruta (PW_CHROMIUM_PATH).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI
  }
});

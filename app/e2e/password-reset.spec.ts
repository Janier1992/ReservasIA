import { expect, test, type Page } from "@playwright/test";
import { INSFORGE, mockBackend } from "./fixtures";

/**
 * Recuperar la contraseña con InsForge simulado: el reenvío del correo y la
 * página a la que lleva el enlace cuando InsForge manda enlace en vez de código.
 */

/** Simula los endpoints de recuperación de InsForge y devuelve lo que la app les mandó. */
async function mockPasswordReset(page: Page, method: "code" | "link") {
  await mockBackend(page);
  const sent = { resetEmails: [] as unknown[], newPasswords: [] as unknown[] };
  await page.route(`${INSFORGE}/api/auth/public-config`, (route) =>
    route.fulfill({ json: { resetPasswordMethod: method, verifyEmailMethod: "code", passwordMinLength: 6, oAuthProviders: [] } })
  );
  await page.route(`${INSFORGE}/api/auth/email/send-reset-password`, (route) => {
    sent.resetEmails.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, message: "ok" } });
  });
  await page.route(`${INSFORGE}/api/auth/email/reset-password`, (route) => {
    sent.newPasswords.push(route.request().postDataJSON());
    return route.fulfill({ json: { message: "ok" } });
  });
  return sent;
}

test("después de pedir el código se puede reenviar, pero no enseguida", async ({ page }) => {
  await page.clock.install();
  const sent = await mockPasswordReset(page, "code");
  await page.goto("/forgot-password");

  await page.getByLabel("Email").fill("laura@test.local");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByLabel("Código")).toBeVisible();
  await expect(page.getByText(/Revisá también las carpetas de spam/)).toBeVisible();

  const resend = page.getByRole("button", { name: /Reenviar código/ });
  await expect(resend).toBeDisabled();
  await page.clock.runFor(61_000);
  await expect(resend).toBeEnabled();
  await resend.click();

  await expect.poll(() => sent.resetEmails.length).toBe(2);
  expect(sent.resetEmails[1]).toMatchObject({ email: "laura@test.local" });
  await expect(resend).toBeDisabled();
});

test("si InsForge manda un enlace, la pantalla lo dice en vez de pedir un código", async ({ page }) => {
  await mockPasswordReset(page, "link");
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("laura@test.local");
  await page.getByRole("button", { name: "Enviar código" }).click();

  await expect(page.getByRole("heading", { name: "Revisá tu correo" })).toBeVisible();
  await expect(page.getByLabel("Código")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reenviar enlace/ })).toBeVisible();
});

test("el enlace del correo lleva a elegir la contraseña nueva", async ({ page }) => {
  const sent = await mockPasswordReset(page, "link");
  await page.goto("/reset-password?token=tok-123&insforge_status=success&insforge_type=reset_password");

  await page.getByLabel("Nueva contraseña").fill("clave-nueva");
  await page.getByLabel("Repetí la contraseña").fill("otra-clave");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
  expect(sent.newPasswords).toHaveLength(0);

  await page.getByLabel("Repetí la contraseña").fill("clave-nueva");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(sent.newPasswords).toEqual([{ newPassword: "clave-nueva", otp: "tok-123" }]);
});

test("un enlace vencido o sin token ofrece pedir otro correo", async ({ page }) => {
  await mockPasswordReset(page, "link");
  await page.goto("/reset-password?insforge_status=error&insforge_type=reset_password");
  await expect(page.getByRole("heading", { name: "El enlace no funciona" })).toBeVisible();
  await page.getByRole("link", { name: "Pedir otro correo" }).first().click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

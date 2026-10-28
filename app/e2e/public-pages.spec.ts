import { expect, test } from "@playwright/test";
import { BARBERSHOP, mockBackend, RESTAURANT } from "./fixtures";

test("a customer books on the public page, and only after authorizing the use of their data", async ({ page }) => {
  const sent = await mockBackend(page);
  await page.goto(`/r/${BARBERSHOP.slug}`);

  await expect(page.getByRole("heading", { name: BARBERSHOP.name })).toBeVisible();
  await page.getByText("Corte clásico").click();
  await page.getByRole("button", { name: /10:00/ }).first().click();
  await page.getByLabel(/Nombre/).fill("Laura Gómez");
  await page.getByLabel(/Celular/).fill("300 111 2233");

  // Sin la casilla de autorización, el navegador no deja enviar.
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  expect(sent.bookings).toHaveLength(0);

  await page.getByRole("checkbox", { name: /Autorizo a Barbería E2E/ }).check();
  await expect(page.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/privacidad");
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByRole("heading", { name: /¡Listo, Laura!/ })).toBeVisible();
  expect(sent.bookings).toEqual([
    expect.objectContaining({ serviceId: "svc-corte", name: "Laura Gómez", phone: "300 111 2233", dataConsent: true })
  ]);
});

test("a customer orders from the QR menu and gets a ticket", async ({ page }) => {
  const sent = await mockBackend(page);
  await page.goto(`/r/${RESTAURANT.slug}`);

  await expect(page.getByRole("heading", { name: RESTAURANT.name })).toBeVisible();
  await expect(page.getByText(/agotado/i).first()).toBeVisible();
  await page.getByRole("button", { name: /Agregar/ }).first().click();
  await page.getByRole("button", { name: /Sumar uno/ }).first().click();
  await page.getByLabel(/Tu nombre/).fill("Mesa 4");
  await expect(page.getByText(/Al hacer el pedido, Restaurante E2E recibe tu nombre/)).toBeVisible();
  await page.getByRole("button", { name: /Hacer pedido/ }).click();

  await expect(page.getByText("#014")).toBeVisible();
  expect(sent.orders).toEqual([expect.objectContaining({ name: "Mesa 4", items: [{ serviceId: "svc-bandeja", quantity: 2 }] })]);
});

test("the login page loads with the privacy and terms links", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Política de privacidad/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Condiciones del servicio/ })).toBeVisible();
});

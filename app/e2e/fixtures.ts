import type { Page, Route } from "@playwright/test";

/** Direcciones con las que se compila la app para estas pruebas (ver playwright.config.ts). */
export const API = "https://api.e2e.test";
export const INSFORGE = "https://insforge.e2e.test";

const service = (id: string, name: string, price: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  description: null,
  durationMinutes: 30,
  price,
  currency: "COP",
  ...extra
});

export const BARBERSHOP = {
  slug: "barberia-e2e",
  mode: "booking",
  businessType: "barbershop",
  timezone: "America/Bogota",
  name: "Barbería E2E",
  description: "Cortes clásicos",
  address: null,
  phone: null,
  logoUrl: null,
  maxBookingDays: 30,
  services: [service("svc-corte", "Corte clásico", 30000), service("svc-barba", "Corte + barba", 45000)]
};

export const RESTAURANT = {
  ...BARBERSHOP,
  slug: "restaurante-e2e",
  mode: "order",
  businessType: "restaurant",
  name: "Restaurante E2E",
  services: [service("svc-bandeja", "Bandeja paisa", 32000), service("svc-jugo", "Jugo natural", 7000, { soldOut: true })]
};

/** Lo que la app le mandó al servidor simulado. */
export interface Sent {
  bookings: Record<string, unknown>[];
  orders: Record<string, unknown>[];
}

/**
 * Simula el servidor (Railway) y bloquea InsForge: ninguna prueba sale a
 * internet ni toca datos reales.
 */
export async function mockBackend(page: Page): Promise<Sent> {
  const sent: Sent = { bookings: [], orders: [] };
  await page.route(`${INSFORGE}/**`, (route) => route.fulfill({ status: 401, json: {} }));
  await page.route(`${API}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const business = url.pathname.includes(RESTAURANT.slug) ? RESTAURANT : BARBERSHOP;
    if (url.pathname.endsWith("/availability")) {
      const date = url.searchParams.get("date")!;
      const start = new Date(`${date}T10:00:00-05:00`);
      return route.fulfill({
        json: { timezone: business.timezone, slots: [{ start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() }] }
      });
    }
    if (url.pathname.endsWith("/reservations")) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      sent.bookings.push(body);
      const start = String(body.start);
      return route.fulfill({
        status: 201,
        json: { id: "res-e2e", start_at: start, end_at: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(), timezone: business.timezone }
      });
    }
    if (url.pathname.endsWith("/orders")) {
      sent.orders.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 201,
        json: {
          code: "K7Q2",
          ticketNumber: 14,
          position: 2,
          serviceName: "Bandeja paisa",
          items: [{ name: "Bandeja paisa", quantity: 2 }],
          total: 64000,
          currency: "COP",
          telegramUrl: null,
          whatsappUrl: null
        }
      });
    }
    return route.fulfill({ json: business });
  });
  return sent;
}

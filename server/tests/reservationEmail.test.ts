import { describe, expect, it, vi } from "vitest";
import { createInsforgeMock, type TableResponse } from "./helpers/insforgeMock.js";
import type { Reservation } from "../src/types/domain.js";

let db: ReturnType<typeof createInsforgeMock>;
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return db;
  }
}));

const { buildReservationEmail, escapeHtml, googleCalendarLink } = await import("../src/services/notifications/reservationEmailTemplate.js");
const { sendReservationEmail } = await import("../src/services/notifications/reservationEmailService.js");

const ok = (data: unknown) => ({ data, error: null });
const base = {
  kind: "confirmed" as const,
  business: { name: "Antojitos Fast Food", logoUrl: "https://cdn.test/logo.png", slogan: "Sabor que enamora", address: "Calle 10 #5-20", phone: "300 123 4567" },
  customerName: "Jhanier Mosquera",
  serviceName: "Bandeja paisa",
  startAt: "2026-09-28T19:00:00.000Z",
  endAt: "2026-09-28T20:00:00.000Z",
  timezone: "America/Bogota",
  partySize: 2,
  notes: null
};

describe("reservation email template", () => {
  it("shows the business brand, the details in the business timezone and a Google Calendar button", () => {
    const { subject, html } = buildReservationEmail(base);
    expect(subject).toBe("Tu reserva está confirmada · Antojitos Fast Food · lun 28 de sep, 2:00 p. m.");
    expect(html).toContain('src="https://cdn.test/logo.png"');
    expect(html).toContain("Sabor que enamora");
    expect(html).toContain("Hola Jhanier");
    expect(html).toContain("Lunes 28 de septiembre de 2026");
    expect(html).toContain("2:00 p. m. – 3:00 p. m.");
    expect(html).toContain("Agregar a Google Calendar");
  });

  it("builds a Google Calendar link with UTC dates, place and timezone", () => {
    const url = new URL(googleCalendarLink(base));
    expect(url.searchParams.get("dates")).toBe("20260928T190000Z/20260928T200000Z");
    expect(url.searchParams.get("text")).toBe("Bandeja paisa · Antojitos Fast Food");
    expect(url.searchParams.get("location")).toBe("Calle 10 #5-20");
    expect(url.searchParams.get("ctz")).toBe("America/Bogota");
  });

  it("includes the cancellation policy when the business has one", () => {
    expect(buildReservationEmail({ ...base, cancellationPolicy: "Avisar con 2 horas" }).html).toContain("Avisar con 2 horas");
    expect(buildReservationEmail(base).html).not.toContain("Política de cancelación");
  });

  it("has no calendar button when the reservation was cancelled", () => {
    const { html, subject } = buildReservationEmail({ ...base, kind: "cancelled" });
    expect(subject).toMatch(/^Tu reserva fue cancelada/);
    expect(html).not.toContain("Agregar a Google Calendar");
  });

  it("escapes business and customer data", () => {
    const { html } = buildReservationEmail({ ...base, customerName: "<script>x</script>", notes: 'sin "cebolla" & ají', business: { ...base.business, logoUrl: null } });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("sin &quot;cebolla&quot; &amp; ají");
    expect(escapeHtml("'")).toBe("&#39;");
  });
});

describe("sendReservationEmail", () => {
  const reservation = {
    id: "r-1",
    organization_id: "org-1",
    customer_id: "c-1",
    service_id: "s-1",
    start_at: base.startAt,
    end_at: base.endAt,
    party_size: 2,
    customer_name: "Jhanier",
    special_requests: null
  } as Reservation;

  function useDb(customer: unknown, overrides: Record<string, TableResponse> = {}) {
    db = createInsforgeMock({
      customers: ok(customer),
      business_profiles: ok({ name: "Antojitos Fast Food", logo_url: null, tagline: null, address: null, phone: null, email: "hola@antojitos.co", cancellation_policy: null }),
      organizations: ok({ name: "Antojitos", timezone: "America/Bogota" }),
      services: ok({ name: "Bandeja paisa" }),
      ...overrides
    });
  }

  it("sends the branded email to the customer", async () => {
    useDb({ email: "cliente@test.com", name: "Jhanier" });
    expect(await sendReservationEmail(reservation, "confirmed")).toBe(true);
    const sent = db.emails.send.mock.calls[0][0];
    expect(sent.to).toBe("cliente@test.com");
    expect(sent).toMatchObject({ replyTo: "hola@antojitos.co" });
    expect(sent.subject).toMatch(/^Tu reserva está confirmada · Antojitos Fast Food/);
  });

  it("skips customers without email so Google can invite them instead", async () => {
    useDb({ email: null, name: "Jhanier" });
    expect(await sendReservationEmail(reservation, "confirmed")).toBe(false);
    expect(db.emails.send).not.toHaveBeenCalled();
  });

  it("reports a failed send without throwing", async () => {
    useDb({ email: "cliente@test.com", name: "Jhanier" });
    db.emails.send.mockResolvedValueOnce({ data: null as unknown as object, error: { message: "quota" } });
    expect(await sendReservationEmail(reservation, "rescheduled")).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { makeData } from "./helpers/agentPromptData.js";

/**
 * Ubicación del negocio: el enlace "cómo llegar" y cómo aparece en las
 * instrucciones del agente y en el correo de confirmación.
 */

vi.mock("../src/lib/insforge.js", () => ({ insforgeAdmin: {} }));

const { businessMapsUrl } = await import("../src/utils/location.js");
const { buildSystemPrompt } = await import("../src/services/agent/systemPrompt.js");
const { buildReservationEmail } = await import("../src/services/notifications/reservationEmailTemplate.js");

const NOW = new Date("2030-01-10T15:00:00.000Z");
const withLocation = (location: { address?: string | null; address_details?: string | null; maps_url?: string | null }) => {
  const data = makeData();
  return makeData({ businessProfile: { ...data.businessProfile, ...location } });
};

describe("enlace para llegar al negocio", () => {
  it("usa el enlace que cargó el negocio", () => {
    expect(businessMapsUrl({ address: "Calle 10", maps_url: " https://maps.app.goo.gl/abc " })).toBe("https://maps.app.goo.gl/abc");
  });

  it("sin enlace, arma una búsqueda de Google Maps con la dirección", () => {
    expect(businessMapsUrl({ address: "Calle 10 # 43-12, Medellín" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Calle%2010%20%23%2043-12%2C%20Medell%C3%ADn"
    );
  });

  it("ignora un enlace que no es https y no inventa nada sin dirección", () => {
    expect(businessMapsUrl({ address: null, maps_url: "javascript:alert(1)" })).toBeNull();
    expect(businessMapsUrl({ address: "  ", maps_url: null })).toBeNull();
  });
});

describe("ubicación en las instrucciones del agente", () => {
  it("le da la dirección, las indicaciones y el enlace, y le pide compartirlos al preguntar cómo llegar y al confirmar", () => {
    const prompt = buildSystemPrompt(
      withLocation({ address: "Calle 10 # 43-12", address_details: "Local 3, frente al parque", maps_url: "https://maps.app.goo.gl/abc" }),
      NOW
    );
    expect(prompt).toContain(
      "UBICACIÓN:\n- Dirección: Calle 10 # 43-12\n- Indicaciones para llegar: Local 3, frente al parque\n- Enlace del mapa: https://maps.app.goo.gl/abc"
    );
    expect(prompt).toContain("cómo llegar, y al confirmarle una reserva nueva, compartí la dirección, las indicaciones y el enlace del mapa copiado tal cual");
  });

  it("sin dirección cargada, le prohíbe inventarla", () => {
    const prompt = buildSystemPrompt(withLocation({ address: null }), NOW);
    expect(prompt).toContain("El negocio no cargó su dirección");
    expect(prompt).toContain("nunca la inventes");
    expect(prompt).not.toContain("Enlace del mapa");
  });
});

describe("ubicación en el correo de confirmación", () => {
  const email = (kind: "confirmed" | "cancelled", business: Record<string, unknown>) =>
    buildReservationEmail({
      kind,
      business: { name: "Barbería", logoUrl: null, slogan: null, address: "Calle 10", phone: null, ...business },
      customerName: "Laura",
      serviceName: null,
      startAt: "2030-01-10T15:00:00.000Z",
      endAt: "2030-01-10T16:00:00.000Z",
      timezone: "America/Bogota",
      partySize: null,
      notes: null
    }).html;

  it("incluye las indicaciones y el botón para ver la ubicación en el mapa", () => {
    const html = email("confirmed", { addressDetails: "Local 3", mapsUrl: "https://maps.app.goo.gl/abc?x=1&y=2" });
    expect(html).toContain("Cómo llegar");
    expect(html).toContain("Local 3");
    expect(html).toContain('href="https://maps.app.goo.gl/abc?x=1&amp;y=2"');
    expect(html).toContain("Ver ubicación en el mapa");
  });

  it("no ofrece el mapa en el correo de una reserva cancelada", () => {
    expect(email("cancelled", { mapsUrl: "https://maps.app.goo.gl/abc" })).not.toContain("Ver ubicación en el mapa");
  });
});

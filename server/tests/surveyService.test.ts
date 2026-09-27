import { describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

const customer = (name: string, phone: string) => ({ name, phone });

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return createInsforgeMock({
      reservations: {
        data: [
          { id: "r1", organization_id: "org-1", customer_id: "c1", conversation_id: "t1", customer_name: null, customers: customer("Ana Ruiz", "telegram:111") },
          { id: "r2", organization_id: "org-1", customer_id: "c2", conversation_id: "w2", customer_name: "Luis", customers: customer("Luis", "+573001112222") },
          { id: "r3", organization_id: "org-1", customer_id: "c3", conversation_id: "w3", customer_name: null, customers: customer("Marta", "+573003334444") },
          { id: "r4", organization_id: "org-2", customer_id: "c4", conversation_id: null, customer_name: null, customers: customer("Beto", "telegram:444") },
          { id: "r5", organization_id: "org-1", customer_id: "c5", conversation_id: null, customer_name: null, customers: customer("Sara", "telegram:555") },
          { id: "r6", organization_id: "org-1", customer_id: "c1", conversation_id: "t1", customer_name: null, customers: customer("Ana Ruiz", "telegram:111") }
        ],
        error: null
      },
      organizations: {
        data: [
          { id: "org-1", status: "active", disabled_modules: [] },
          { id: "org-2", status: "active", disabled_modules: ["surveys"] }
        ],
        error: null
      },
      business_profiles: {
        data: [
          { organization_id: "org-1", name: "Barbería Z", survey_auto_send: true },
          { organization_id: "org-2", name: "Otra", survey_auto_send: true }
        ],
        error: null
      },
      survey_requests: { data: [{ reservation_id: "r5" }], error: null },
      // Solo Luis escribió por WhatsApp en las últimas 24 horas.
      messages: { data: [{ conversation_id: "w2" }], error: null }
    });
  }
}));

const { buildSurveyText, findSurveyCandidates } = await import("../src/services/surveys/surveyService.js");

describe("surveyService", () => {
  it("picks Telegram customers and WhatsApp customers inside the 24h window, once per customer, only where the module is on", async () => {
    const candidates = await findSurveyCandidates(new Date("2026-09-27T12:00:00Z"));
    expect(candidates.map((c) => [c.reservationId, c.channel])).toEqual([
      ["r1", "telegram"],
      ["r2", "whatsapp"]
    ]);
    expect(candidates[0]).toMatchObject({ customerName: "Ana Ruiz", businessName: "Barbería Z" });
  });

  it("writes a short message with the first name and link", () => {
    expect(buildSurveyText("Ana Ruiz", "Barbería Z", "https://app/o/x")).toBe(
      "Hola Ana, gracias por visitarnos en Barbería Z. ¿Nos contás cómo te fue? Son 10 segundos: https://app/o/x"
    );
  });
});

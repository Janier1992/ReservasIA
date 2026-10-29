import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";
import { makeData } from "./helpers/agentPromptData.js";

/**
 * Lo que el agente "sabe" del negocio: cómo se cargan los datos de la base y
 * cómo quedan escritos horarios, servicios, recursos, reglas y cliente en
 * sus instrucciones. Complementa promptBuilder.test.ts (reglas y rubros).
 */

let insforgeMockInstance = createInsforgeMock({});
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { buildSystemPrompt, loadAgentPromptData } = await import("../src/services/agent/promptBuilder.js");

const NOW = new Date("2030-01-10T15:00:00.000Z");
const base = makeData();

const period = (day: number, open: string | null, close: string | null, closed = false) => ({
  id: `p-${day}-${open}`,
  organization_id: "org-1",
  day_of_week: day,
  opening_time: open,
  closing_time: close,
  is_closed: closed
});

describe("datos del negocio en las instrucciones del agente", () => {
  it("escribe los horarios por día, con varias franjas y los días cerrados", () => {
    const prompt = buildSystemPrompt(
      makeData({
        hours: [period(1, "09:00:00", "12:00:00"), period(1, "14:00:00", "19:00:00"), period(0, null, null, true)] as never
      }),
      NOW
    );
    expect(prompt).toContain("- Domingo: cerrado\n- Lunes: 09:00-12:00, 14:00-19:00");
    expect(prompt).not.toContain("Martes");
  });

  it("avisa cuando el negocio todavía no cargó horarios, servicios ni recursos", () => {
    const prompt = buildSystemPrompt(base, NOW);
    expect(prompt).toContain("No hay horarios configurados.");
    expect(prompt).toContain("No hay servicios configurados.");
    expect(prompt).toContain("no utiliza recursos individuales");
  });

  it("lista servicios con duración y precio, y recursos con su tipo", () => {
    const prompt = buildSystemPrompt(
      makeData({
        services: [
          { name: "Corte", duration_minutes: 30, price: 25000, currency: "COP" },
          { name: "Consulta", duration_minutes: 20, price: null, currency: "COP" }
        ] as never,
        resources: [{ name: "Silla 1", resource_type: "silla" }, { name: "Silla 2", resource_type: null }] as never
      }),
      NOW
    );
    expect(prompt).toContain("- Corte (30 min, 25000 COP)\n- Consulta (20 min)");
    expect(prompt).toContain("- Silla 1 (silla)\n- Silla 2");
  });

  it("incluye solo las reglas activas del negocio, en orden de prioridad", () => {
    const prompt = buildSystemPrompt(
      makeData({
        agentRules: [
          { name: "Segunda", instruction: "Ofrecé el combo.", enabled: true, priority: 2 },
          { name: "Apagada", instruction: "No debería salir.", enabled: false, priority: 0 },
          { name: "Primera", instruction: "Saludá por el nombre.", enabled: true, priority: 1 }
        ] as never
      }),
      NOW
    );
    expect(prompt).toContain("- (Primera) Saludá por el nombre.\n- (Segunda) Ofrecé el combo.");
    expect(prompt).not.toContain("No debería salir.");
  });

  it("da la fecha y hora en la zona del negocio y presenta al cliente si ya se conoce", () => {
    const anonymous = buildSystemPrompt(base, NOW);
    expect(anonymous).toContain("(America/Bogota)");
    expect(anonymous).toContain("10:00");
    expect(anonymous).toContain("CLIENTE ACTUAL: aún no identificado.");

    const known = buildSystemPrompt(makeData({ customer: { name: "Laura", phone: "+573001112233" } as never }), NOW);
    expect(known).toContain("CLIENTE ACTUAL: Laura, teléfono +573001112233.");
  });

  it("deja la hora y el cliente al final, para que el resto se reutilice del caché entre mensajes", () => {
    const first = buildSystemPrompt(base, NOW);
    const later = buildSystemPrompt(makeData({ customer: { name: "Laura", phone: "+573001112233" } as never }), new Date(NOW.getTime() + 90 * 60_000));
    const fixedPart = first.slice(0, first.indexOf("FECHA Y HORA ACTUAL DEL NEGOCIO"));
    expect(later.startsWith(fixedPart)).toBe(true);
    expect(fixedPart).toContain("REGLAS ADICIONALES DEL NEGOCIO");
    expect(first.length - fixedPart.length).toBeLessThan(200);
  });

  it("solo pide el correo del cliente para Google Calendar cuando el calendario está conectado", () => {
    expect(buildSystemPrompt(base, NOW)).toContain("No pidas el email del cliente para esto.");
    expect(buildSystemPrompt(makeData({ googleCalendarConnected: true }), NOW)).toContain("campo email_cliente");
  });

  it("refleja las capacidades que el negocio apagó", () => {
    const prompt = buildSystemPrompt(
      makeData({ agentConfig: { ...base.agentConfig, cancellation_enabled: false, rescheduling_enabled: false, tone: "formal" } }),
      NOW
    );
    expect(prompt).toContain("- Crear reservas: sí\n- Cancelar reservas: no\n- Reprogramar reservas: no");
    expect(prompt).toContain("tono formal");
  });
});

describe("carga de los datos del negocio", () => {
  beforeEach(() => {
    insforgeMockInstance = createInsforgeMock({
      organizations: { data: { id: "org-1", business_type: "barbershop", timezone: "America/Bogota", status: "active" }, error: null },
      agents: { data: base.agentConfig, error: null },
      business_profiles: { data: base.businessProfile, error: null },
      services: { data: [{ name: "Corte" }], error: null },
      resources: { data: null, error: null },
      business_hour_periods: { data: [], error: null },
      agent_rules: { data: [], error: null },
      customers: { data: { id: "cust-1", name: "Laura" }, error: null },
      integrations: { data: { status: "connected" }, error: null }
    });
  });

  it("junta la configuración del negocio, el cliente y si Google Calendar está conectado", async () => {
    const data = await loadAgentPromptData("org-1", "cust-1");
    expect(data.organization).toEqual({ id: "org-1", businessType: "barbershop", timezone: "America/Bogota", status: "active" });
    expect(data.services).toEqual([{ name: "Corte" }]);
    expect(data.resources).toEqual([]);
    expect(data.customer).toMatchObject({ name: "Laura" });
    expect(data.googleCalendarConnected).toBe(true);
  });

  it("sin cliente identificado no lo busca", async () => {
    const data = await loadAgentPromptData("org-1", null);
    expect(data.customer).toBeNull();
    expect(insforgeMockInstance.database.from).not.toHaveBeenCalledWith("customers");
  });

  it("falla con un error claro si el negocio no terminó de configurarse", async () => {
    insforgeMockInstance = createInsforgeMock({
      organizations: { data: { id: "org-1", business_type: "barbershop", timezone: "America/Bogota", status: "active" }, error: null },
      agents: { data: null, error: null },
      business_profiles: { data: base.businessProfile, error: null },
      services: { data: [], error: null },
      resources: { data: [], error: null },
      business_hour_periods: { data: [], error: null },
      agent_rules: { data: [], error: null },
      integrations: { data: null, error: null }
    });
    await expect(loadAgentPromptData("org-1", null)).rejects.toMatchObject({ code: "ORGANIZATION_NOT_FOUND" });
  });
});

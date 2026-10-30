import { describe, expect, it, vi } from "vitest";
import { formatReport, runScenario, stubAvailability } from "../scripts/agentEvals.js";
import { barber, dental, scenarios, THURSDAY_NIGHT, weekendRestaurant } from "../scripts/agentEvalScenarios.js";

/**
 * La batería de pruebas con el modelo real (scripts/agentEvals.ts) se corre
 * a mano contra OpenRouter. Acá se prueba la batería en sí, con un modelo
 * simulado: que las herramientas de prueba respondan bien y que una
 * respuesta inventada se marque como falla.
 */

function fakeClient(...replies: unknown[]) {
  const create = vi.fn();
  for (const reply of replies) create.mockResolvedValueOnce({ choices: [{ message: reply }] });
  return { client: { chat: { completions: { create } } } as never, create };
}

const scenario = (id: string) => scenarios.find((s) => s.id === id)!;

describe("batería de pruebas del agente", () => {
  it("tiene unos 20 escenarios con ids únicos y expresiones sin tildes (se comparan con el texto normalizado)", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(20);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    for (const s of scenarios) {
      for (const re of [...(s.mustInclude ?? []), ...(s.mustNotInclude ?? [])]) expect(re.source).not.toMatch(/[áéíóúñ]/);
    }
  });

  it("la disponibilidad de prueba sigue el horario, las horas ya pasadas y los festivos", () => {
    // Viernes 30: de 9 a 19, cupos de una hora.
    const friday = stubAvailability(barber, { fecha: "2026-10-30" }, THURSDAY_NIGHT);
    expect(friday.slots[0]).toMatchObject({ fecha: "2026-10-30", hora: "09:00", cuando: "viernes 30 de octubre a las 9:00 a. m.", hasta: "10:00 a. m." });
    expect(friday.slots).toHaveLength(8);
    // Jueves 29 a las 8:45 p. m.: ya no queda nada hoy.
    expect(stubAvailability(barber, { fecha: "2026-10-29" }, THURSDAY_NIGHT).available).toBe(false);
    expect(stubAvailability(weekendRestaurant, { fecha: "2026-10-30" }, THURSDAY_NIGHT).available).toBe(false);
    expect(stubAvailability(dental, { fecha: "2026-11-02" }, THURSDAY_NIGHT).reason).toContain("festivo");
    // Con hora preferida, la más cercana primero.
    expect(stubAvailability(barber, { fecha: "2026-10-30", hora_preferida: "15:00" }, THURSDAY_NIGHT).slots[0].hora).toBe("15:00");
  });

  it("pasa una respuesta correcta que usa la disponibilidad de prueba", async () => {
    const { client, create } = fakeClient(
      { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "consultar_disponibilidad", arguments: '{"fecha":"2026-10-30","hora_preferida":"10:00"}' } }] },
      { content: "¡Sí! Mañana, viernes 30 de octubre, tengo libre a las 10:00 a. m. ¿Te lo reservo?" }
    );
    const result = await runScenario(client, "modelo", scenario("barberia-cupo-manana-10"));
    expect(result).toMatchObject({ passed: true, tools: ["consultar_disponibilidad"], issues: [] });
    // Mismas condiciones que producción: herramientas reales y "creatividad" baja.
    expect(create.mock.calls[0][0]).toMatchObject({ model: "modelo", temperature: 0.1, tool_choice: "auto" });
  });

  it("marca como falla el caso real 'mañana lunes' y un horario inventado", async () => {
    const tomorrow = await runScenario(fakeClient({ content: "Sí, mañana lunes abrimos a las 9:00 a. m." }).client, "m", scenario("barberia-abren-manana"));
    expect(tomorrow.passed).toBe(false);
    expect(tomorrow.issues.map((i) => i.kind)).toContain("date");
    expect(tomorrow.forbidden).toEqual(["/lunes/"]);

    const night = await runScenario(fakeClient({ content: "Abrimos sábados y domingos de 7:00 p. m. a 11:00 p. m." }).client, "m", scenario("restaurante-horario"));
    expect(night.passed).toBe(false);
    expect(night.issues.map((i) => i.kind)).toEqual(["hour", "hour"]);
  });

  it("si el modelo falla, lo informa como error sin cortar la batería", async () => {
    const create = vi.fn().mockRejectedValue(new Error("401 sin crédito"));
    const result = await runScenario({ chat: { completions: { create } } } as never, "m", scenario("barberia-domingo"));
    expect(result).toMatchObject({ passed: false, error: "401 sin crédito" });
  });

  it("el informe resume cuántas pasaron y muestra el motivo de cada falla", () => {
    const report = formatReport(
      [
        { id: "a", passed: true, reply: "ok", issues: [], missing: [], forbidden: [], tools: [] },
        { id: "b", passed: false, reply: "Mañana lunes | abrimos", issues: [{ kind: "date", detail: "Dijiste que mañana es lunes" }], missing: [], forbidden: ["/lunes/"], tools: [] }
      ],
      "openai/gpt-4o-mini"
    );
    expect(report).toContain("**1/2** respuestas correctas");
    expect(report).toContain("| b | Dijiste que mañana es lunes; no debería decir /lunes/ | Mañana lunes \\| abrimos |");
  });
});

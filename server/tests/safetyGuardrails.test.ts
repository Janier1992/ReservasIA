import { describe, expect, it } from "vitest";
import { containsMedicalAdvice, detectEmergency, isHealthNiche, parseConsentAnswer, requiresHealthDataConsent } from "../src/services/agent/safetyGuardrails.js";

describe("isHealthNiche", () => {
  it("flags dental, clinic, physiotherapy and veterinary", () => {
    for (const type of ["dental", "clinic", "physiotherapy", "veterinary"]) {
      expect(isHealthNiche(type)).toBe(true);
    }
  });

  it("does not flag other niches", () => {
    for (const type of ["barbershop", "restaurant", "academy", "auto_repair", "gym"]) {
      expect(isHealthNiche(type)).toBe(false);
    }
  });
});

describe("detectEmergency", () => {
  const emergencies = [
    "no puedo respirar",
    "mi perro no puede respirar",
    "tengo un dolor muy fuerte en el pecho",
    "se está ahogando",
    "convulsionando hace 2 minutos",
    "perdió el conocimiento",
    "se desmayó de repente",
    "está sangrando mucho y no para",
    "lo atropelló un carro",
    "se comió veneno para ratas",
    "mi gato está intoxicado",
    "no reacciona"
  ];

  it.each(emergencies)("flags %s as an emergency", (message) => {
    expect(detectEmergency(message)).toBe(true);
  });

  const normalMessages = [
    "quiero agendar una cita para mañana",
    "¿tienen turno para el viernes?",
    "necesito cancelar mi reserva",
    "¿cuánto cuesta la consulta?",
    "mi perro necesita una vacuna"
  ];

  it.each(normalMessages)("does not flag a normal message: %s", (message) => {
    expect(detectEmergency(message)).toBe(false);
  });
});

describe("containsMedicalAdvice", () => {
  it("flags a reply naming a common medication", () => {
    expect(containsMedicalAdvice("Podés tomar ibuprofeno para el dolor.")).toBe(true);
  });

  it("flags a reply with a dosage pattern even without naming a drug", () => {
    expect(containsMedicalAdvice("Tomá 400mg cada 8 horas.")).toBe(true);
  });

  it("flags a reply with a frequency pattern", () => {
    expect(containsMedicalAdvice("Aplicalo 3 veces al día.")).toBe(true);
  });

  it("does not flag a normal booking reply", () => {
    expect(containsMedicalAdvice("¡Listo! Tu turno quedó confirmado para mañana a las 10am.")).toBe(false);
  });

  it("does not flag a reply that just mentions the price of a consultation", () => {
    expect(containsMedicalAdvice("La consulta general tiene un valor de 50000 pesos.")).toBe(false);
  });
});

describe("health data consent", () => {
  it("applies only to human health niches", () => {
    for (const t of ["dental", "clinic", "physiotherapy"]) expect(requiresHealthDataConsent(t)).toBe(true);
    for (const t of ["veterinary", "barbershop", "restaurant"]) expect(requiresHealthDataConsent(t)).toBe(false);
  });

  it("reads a clear yes or no at the start of the message", () => {
    for (const m of ["Sí", "si", "Sí, autorizo", "acepto", "Autorizo", "de acuerdo", "claro que sí", "ok, el martes"]) {
      expect(parseConsentAnswer(m)).toBe("yes");
    }
    for (const m of ["no", "No autorizo", "no, gracias"]) expect(parseConsentAnswer(m)).toBe("no");
    for (const m of ["quiero una cita", "nombre: Ana", "¿sirve el martes?", "simplemente quiero agendar"]) {
      expect(parseConsentAnswer(m)).toBeNull();
    }
  });
});

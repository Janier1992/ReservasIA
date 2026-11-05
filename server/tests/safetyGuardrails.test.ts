import { describe, expect, it } from "vitest";
import { containsMedicalAdvice, detectEmergency, isHealthNiche, parseConsentAnswer, requiresHealthDataConsent } from "../src/services/agent/safetyGuardrails.js";

describe("isHealthNiche", () => {
  it("marca odontología, clínica, fisioterapia y veterinaria", () => {
    for (const type of ["dental", "clinic", "physiotherapy", "veterinary"]) {
      expect(isHealthNiche(type)).toBe(true);
    }
  });

  it("no marca otros rubros", () => {
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

  it.each(emergencies)("marca %s como emergencia", (message) => {
    expect(detectEmergency(message)).toBe(true);
  });

  const normalMessages = [
    "quiero agendar una cita para mañana",
    "¿tienen turno para el viernes?",
    "necesito cancelar mi reserva",
    "¿cuánto cuesta la consulta?",
    "mi perro necesita una vacuna"
  ];

  it.each(normalMessages)("no marca un mensaje normal: %s", (message) => {
    expect(detectEmergency(message)).toBe(false);
  });
});

describe("containsMedicalAdvice", () => {
  it("marca una respuesta que nombra un medicamento común", () => {
    expect(containsMedicalAdvice("Podés tomar ibuprofeno para el dolor.")).toBe(true);
  });

  it("marca una respuesta con un patrón de dosis aunque no nombre un medicamento", () => {
    expect(containsMedicalAdvice("Tomá 400mg cada 8 horas.")).toBe(true);
  });

  it("marca una respuesta con un patrón de frecuencia", () => {
    expect(containsMedicalAdvice("Aplicalo 3 veces al día.")).toBe(true);
  });

  it("no marca una respuesta normal de reserva", () => {
    expect(containsMedicalAdvice("¡Listo! Tu turno quedó confirmado para mañana a las 10am.")).toBe(false);
  });

  it("no marca una respuesta que solo menciona el precio de una consulta", () => {
    expect(containsMedicalAdvice("La consulta general tiene un valor de 50000 pesos.")).toBe(false);
  });
});

describe("autorización de datos de salud", () => {
  it("aplica solo a los rubros de salud humana", () => {
    for (const t of ["dental", "clinic", "physiotherapy"]) expect(requiresHealthDataConsent(t)).toBe(true);
    for (const t of ["veterinary", "barbershop", "restaurant"]) expect(requiresHealthDataConsent(t)).toBe(false);
  });

  it("lee un sí o un no claro al principio del mensaje", () => {
    for (const m of ["Sí", "si", "Sí, autorizo", "acepto", "Autorizo", "de acuerdo", "claro que sí", "ok, el martes"]) {
      expect(parseConsentAnswer(m)).toBe("yes");
    }
    for (const m of ["no", "No autorizo", "no, gracias"]) expect(parseConsentAnswer(m)).toBe("no");
    for (const m of ["quiero una cita", "nombre: Ana", "¿sirve el martes?", "simplemente quiero agendar"]) {
      expect(parseConsentAnswer(m)).toBeNull();
    }
  });
});

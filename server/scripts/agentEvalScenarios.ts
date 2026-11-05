// Negocios de ejemplo y escenarios de la batería de pruebas del agente con el
// modelo real (scripts/agentEvals.ts). Cada escenario es una pregunta de un
// cliente con lo que la respuesta TIENE que decir y lo que NO puede decir.
// Varios salen de conversaciones reales donde el agente se equivocó
// (horario "de noche" en un negocio diurno, "mañana lunes" un jueves).
//
// Para agregar un escenario: copiá uno parecido, cambiá la pregunta y las
// expresiones. Las expresiones se comparan sin tildes y en minúsculas.
import type { AgentPromptData } from "../src/services/agent/systemPrompt.js";
import type { BusinessHourPeriod, Resource, Service } from "../src/types/domain.js";

/** Jueves 29 de octubre de 2026, 8:45 p. m. en Bogotá (el día del caso real "mañana lunes"). */
export const THURSDAY_NIGHT = new Date("2026-10-30T01:45:00.000Z");
/** Viernes 30 de octubre de 2026, 10:00 a. m. en Bogotá. */
export const FRIDAY_MORNING = new Date("2026-10-30T15:00:00.000Z");

export interface EvalScenario {
  id: string;
  business: AgentPromptData;
  /** Mensajes del cliente (y, si hace falta contexto, respuestas previas del agente). */
  conversation: { role: "user" | "assistant"; content: string }[];
  now?: Date;
  /** Todas tienen que aparecer en la respuesta. */
  mustInclude?: RegExp[];
  /** Ninguna puede aparecer en la respuesta. */
  mustNotInclude?: RegExp[];
}

const ORG = "00000000-0000-4000-8000-000000000001";

function period(day: number, open: string, close: string): BusinessHourPeriod {
  return { id: `p-${day}-${open}`, organization_id: ORG, day_of_week: day, opening_time: open, closing_time: close, is_closed: false };
}

function service(id: number, name: string, price: number | null, duration = 30): Service {
  return {
    id: `00000000-0000-4000-8000-0000000001${String(id).padStart(2, "0")}`,
    organization_id: ORG,
    name,
    description: null,
    duration_minutes: duration,
    price,
    currency: "COP",
    is_active: true
  };
}

function resource(id: number, name: string, type: string): Resource {
  return {
    id: `00000000-0000-4000-8000-0000000002${String(id).padStart(2, "0")}`,
    organization_id: ORG,
    name,
    resource_type: type,
    is_active: true
  } as Resource;
}

function business(name: string, businessType: string, overrides: Partial<AgentPromptData>): AgentPromptData {
  return {
    organization: { id: ORG, businessType, timezone: "America/Bogota", status: "active" },
    agentConfig: {
      id: "agent-eval",
      organization_id: ORG,
      name: "Sofi",
      enabled: true,
      language: "es",
      tone: "friendly",
      system_instructions: null,
      booking_enabled: true,
      cancellation_enabled: true,
      rescheduling_enabled: true
    },
    businessProfile: {
      id: "bp-eval",
      organization_id: ORG,
      name,
      description: null,
      address: "Calle 10 # 20-30",
      phone: "+573001112233",
      email: null,
      website: null,
      business_type: businessType,
      category: null,
      currency: "COP",
      timezone: "America/Bogota",
      capacity_total: null,
      reservation_duration_minutes: 60,
      slot_interval_minutes: 60,
      advance_booking_hours: 1,
      max_booking_days: 45,
      cancellation_policy: null,
      special_instructions: null,
      nequi_phone: null,
      deposit_enabled: false,
      deposit_mandatory: false,
      deposit_percentage: null,
      logo_url: null,
      reminder_hours_before: 24
    },
    services: [],
    resources: [],
    hours: [],
    resourceHours: [],
    blocks: [],
    agentRules: [],
    customer: null,
    googleCalendarConnected: false,
    ...overrides
  };
}

const carlos = resource(1, "Carlos", "barbero");

/** Barbería de lunes a sábado, de día; Carlos solo atiende viernes y sábado por la tarde. */
export const barber = business("Barber Black", "barbershop", {
  hours: [1, 2, 3, 4, 5, 6].map((d) => period(d, "09:00:00", "19:00:00")),
  services: [service(1, "Corte", 25000), service(2, "Barba", 15000), service(3, "Corte y barba", 35000, 45)],
  resources: [carlos, resource(2, "Andrés", "barbero")],
  resourceHours: [5, 6].map((d) => ({ resource_id: carlos.id, day_of_week: d, opening_time: "14:00:00", closing_time: "19:00:00" }))
});

/** Restaurante que abre solo sábados y domingos, de día. Sin precios cargados. */
export const weekendRestaurant = business("Restaurante Caribeño", "restaurant", {
  hours: [6, 0].map((d) => period(d, "08:00:00", "16:00:00"))
});

/** Odontología con pausa de almuerzo, sábado medio día y el lunes 2 de noviembre festivo. */
export const dental = business("Clínica Sonrisa", "dental", {
  hours: [
    ...[1, 2, 3, 4, 5].flatMap((d) => [period(d, "08:00:00", "12:00:00"), period(d, "14:00:00", "18:00:00")]),
    period(6, "08:00:00", "12:00:00")
  ],
  services: [service(4, "Limpieza", 80000, 45), service(5, "Valoración", null, 20)],
  blocks: [{ resource_id: null, starts_at: "2026-11-02T05:00:00.000Z", ends_at: "2026-11-03T05:00:00.000Z", reason: "Festivo" }]
});

const ask = (content: string) => [{ role: "user" as const, content }];

export const scenarios: EvalScenario[] = [
  // --- Días y "mañana" -----------------------------------------------------
  { id: "barberia-abren-manana", business: barber, conversation: ask("¿Abren mañana?"), mustInclude: [/viernes|si|abrimos|atendemos/], mustNotInclude: [/lunes/] },
  { id: "barberia-que-dia-es-manana", business: barber, conversation: ask("¿Qué día es mañana?"), mustInclude: [/viernes/], mustNotInclude: [/lunes|sabado/] },
  { id: "barberia-domingo", business: barber, conversation: ask("¿Atienden el domingo?"), mustInclude: [/\bno\b|cerrad/] },
  { id: "restaurante-abren-manana", business: weekendRestaurant, conversation: ask("¿Abren mañana?"), mustInclude: [/\bno\b|cerrad/, /sabado/] },
  { id: "restaurante-lunes", business: weekendRestaurant, conversation: ask("¿Abren el lunes?"), mustInclude: [/\bno\b|cerrad/] },
  { id: "odontologia-lunes-festivo", business: dental, conversation: ask("¿Atienden el lunes?"), now: FRIDAY_MORNING, mustInclude: [/festiv|cerrad|\bno\b/] },
  { id: "barberia-hoy-ya-cerro", business: barber, conversation: ask("¿Todavía puedo ir hoy?"), mustInclude: [/\bno\b|cerr|manana/] },

  // --- Horarios ----------------------------------------------------------
  { id: "barberia-horario", business: barber, conversation: ask("¿Qué horario tienen?"), mustInclude: [/\b9\b/, /\b7\b|19/, /lunes/, /sabado/], mustNotInclude: [/noche/] },
  { id: "restaurante-horario", business: weekendRestaurant, conversation: ask("¿Qué horarios manejan?"), mustInclude: [/sabado/, /domingo/, /\b8\b/, /\b4\b|16/], mustNotInclude: [/noche|lunes a viernes/] },
  { id: "barberia-sabado-noche", business: barber, conversation: ask("¿Puedo ir el sábado a las 8 de la noche?"), mustInclude: [/\bno\b|cerr|hasta las 7|7:00/] },
  { id: "odontologia-sabado", business: dental, conversation: ask("¿A qué hora abren el sábado?"), mustInclude: [/\b8\b/, /\b12\b|mediodia/] },
  { id: "odontologia-almuerzo", business: dental, conversation: ask("¿Me pueden atender el martes a la 1 de la tarde?"), mustInclude: [/\bno\b|\b2\b|14:00/] },
  { id: "barberia-carlos-lunes", business: barber, conversation: ask("¿Carlos trabaja el lunes?"), mustInclude: [/\bno\b|viernes|sabado/] },

  // --- Precios -----------------------------------------------------------
  { id: "barberia-precio-corte", business: barber, conversation: ask("¿Cuánto vale el corte?"), mustInclude: [/25[.,]?000|25 mil/] },
  { id: "barberia-precio-combo", business: barber, conversation: ask("¿Y corte con barba cuánto sale?"), mustInclude: [/35[.,]?000|35 mil/] },
  { id: "barberia-servicio-inexistente", business: barber, conversation: ask("¿Cuánto cuesta un tinte?"), mustNotInclude: [/tinte (cuesta|vale|sale)/] },
  { id: "restaurante-sin-precios", business: weekendRestaurant, conversation: ask("¿Cuánto vale el almuerzo?"), mustNotInclude: [/\$\s?\d|\d+\s?(mil|pesos)/] },
  { id: "odontologia-precio-limpieza", business: dental, conversation: ask("¿Cuánto cuesta la limpieza?"), now: FRIDAY_MORNING, mustInclude: [/80[.,]?000|80 mil/] },
  { id: "odontologia-valoracion-sin-precio", business: dental, conversation: ask("¿Cuánto cuesta la valoración?"), now: FRIDAY_MORNING, mustNotInclude: [/\$\s?\d|\d+\s?(mil|pesos)/] },

  // --- Reservas con disponibilidad (usa la herramienta de prueba) ----------
  { id: "barberia-cupo-manana-10", business: barber, conversation: ask("Quiero un corte mañana a las 10 de la mañana, ¿hay cupo?"), mustNotInclude: [/lunes/] },
  { id: "restaurante-mesa-sabado", business: weekendRestaurant, conversation: ask("Quiero reservar mesa para 4 el sábado al mediodía"), mustNotInclude: [/noche/] },
  {
    id: "barberia-seguimiento-viernes",
    business: barber,
    conversation: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Soy Sofi de Barber Black. ¿En qué te ayudo?" },
      { role: "user", content: "¿Hasta qué hora atienden el viernes?" }
    ],
    mustInclude: [/\b7\b|19/],
    mustNotInclude: [/noche/]
  }
];

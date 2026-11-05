// Instrucciones del agente (system prompt) a partir de la configuración del
// negocio. Este módulo no depende de nada propio del server (variables de
// entorno, cliente admin, logger) a propósito: la Edge Function
// functions/agent-preview.ts lo importa tal cual para que la vista previa
// del panel use exactamente las mismas instrucciones que el agente real.
// Si agregás un import acá, tiene que ser igual de autónomo.
import type { InsForgeClient } from "@insforge/sdk";
import { CORE_AGENT_RULES } from "./coreRules.js";
import { businessTypeGuidance, businessTypeLabel } from "./businessTypes.js";
import { businessMapsUrl } from "../../utils/location.js";
import {
  formatNow,
  formatResourceHours,
  formatUpcomingDays,
  formatWeeklyHours,
  UPCOMING_DAYS,
  type AgendaBlock,
  type ResourceHours
} from "./scheduleText.js";
import type { AgentConfig, AgentRule, BusinessHourPeriod, BusinessProfile, Customer, Resource, Service } from "../../types/domain.js";

function formatServices(services: Service[]): string {
  if (services.length === 0) return "No hay servicios configurados.";
  return services
    .map((s) => `- ${s.name} (${s.duration_minutes} min${s.price ? `, ${s.price} ${s.currency}` : ""})`)
    .join("\n");
}

function formatResources(resources: Resource[]): string {
  if (resources.length === 0) return "Este negocio no utiliza recursos individuales (mesas/personal) para reservar.";
  return resources.map((r) => `- ${r.name}${r.resource_type ? ` (${r.resource_type})` : ""}`).join("\n");
}

function formatPaymentPolicy(profile: BusinessProfile): string {
  if (!profile.deposit_enabled || !profile.nequi_phone || !profile.deposit_percentage) {
    return "Este negocio no pide anticipo. No menciones pagos por adelantado.";
  }
  const kind = profile.deposit_mandatory ? "OBLIGATORIO" : "opcional (dejale elegir al cliente)";
  return `Anticipo ${kind} del ${profile.deposit_percentage}% del precio del servicio, a pagar por Nequi al número ${profile.nequi_phone}. El monto exacto y el número te los devuelve la herramienta crear_reserva, nunca los calcules ni los repitas de memoria.`;
}

function formatLocation(profile: BusinessProfile): string {
  const mapsUrl = businessMapsUrl(profile);
  if (!profile.address?.trim() && !mapsUrl) {
    return "El negocio no cargó su dirección. Si el cliente pregunta cómo llegar, decile que se la confirma el negocio; nunca la inventes.";
  }
  const lines = [`- Dirección: ${profile.address?.trim() || "No especificada"}`];
  if (profile.address_details?.trim()) lines.push(`- Indicaciones para llegar: ${profile.address_details.trim()}`);
  if (mapsUrl) lines.push(`- Enlace del mapa: ${mapsUrl}`);
  lines.push(
    "Cuando el cliente pregunte dónde queda el negocio o cómo llegar, y al confirmarle una reserva nueva, compartí la dirección" +
      (profile.address_details?.trim() ? ", las indicaciones" : "") +
      (mapsUrl ? " y el enlace del mapa copiado tal cual, sin cambiarlo ni acortarlo" : "") +
      "."
  );
  return lines.join("\n");
}

function formatCurrentCustomer(customer: Customer | null): string {
  if (!customer) return "CLIENTE ACTUAL: aún no identificado.";
  const email = customer.email?.trim() ? `, correo registrado ${customer.email.trim()}` : ", sin correo registrado";
  return `CLIENTE ACTUAL: ${customer.name ?? "Sin nombre registrado"}, teléfono ${customer.phone ?? "N/D"}${email}.`;
}

function formatAgentRules(rules: AgentRule[]): string {
  const enabled = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  if (enabled.length === 0) return "Sin reglas adicionales.";
  return enabled.map((r) => `- (${r.name}) ${r.instruction}`).join("\n");
}

export interface AgentPromptData {
  organization: { id: string; businessType: string; timezone: string; status: string };
  agentConfig: AgentConfig;
  businessProfile: BusinessProfile;
  services: Service[];
  resources: Resource[];
  hours: BusinessHourPeriod[];
  /** Horario propio de los recursos que lo tienen (resource_hour_periods). */
  resourceHours: ResourceHours[];
  /** Bloqueos de agenda de los próximos días (schedule_blocks). */
  blocks: AgendaBlock[];
  agentRules: AgentRule[];
  customer: Customer | null;
  googleCalendarConnected: boolean;
}

/**
 * Lee de la base todo lo que el agente necesita saber del negocio (y del
 * cliente, si ya se conoce). Recibe el cliente de InsForge para que la usen
 * igual el server (cliente admin) y la vista previa del panel (cliente del
 * usuario, con RLS). Devuelve null si el negocio no terminó de configurarse
 * (falta la organización, el agente o el perfil).
 */
export async function fetchAgentPromptData(
  db: InsForgeClient,
  organizationId: string,
  customerId: string | null
): Promise<AgentPromptData | null> {
  const [
    { data: org },
    { data: agentConfig },
    { data: businessProfile },
    { data: services },
    { data: resources },
    { data: hours },
    { data: resourceHours },
    { data: blocks },
    { data: agentRules },
    customerResult,
    { data: googleIntegration }
  ] = await Promise.all([
    db.database.from("organizations").select("id, business_type, timezone, status").eq("id", organizationId).maybeSingle(),
    db.database.from("agents").select("*").eq("organization_id", organizationId).maybeSingle(),
    db.database.from("business_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
    db.database.from("services").select("*").eq("organization_id", organizationId).eq("is_active", true),
    db.database.from("resources").select("*").eq("organization_id", organizationId).eq("is_active", true),
    db.database.from("business_hour_periods").select("*").eq("organization_id", organizationId),
    db.database
      .from("resource_hour_periods")
      .select("resource_id, day_of_week, opening_time, closing_time")
      .eq("organization_id", organizationId),
    db.database
      .from("schedule_blocks")
      .select("resource_id, starts_at, ends_at, reason")
      .eq("organization_id", organizationId)
      .lt("starts_at", new Date(Date.now() + (UPCOMING_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString())
      .gt("ends_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    db.database.from("agent_rules").select("*").eq("organization_id", organizationId).eq("enabled", true),
    customerId
      ? db.database.from("customers").select("*").eq("id", customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.database
      .from("integrations")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("provider", "google_calendar")
      .maybeSingle()
  ]);

  if (!org || !agentConfig || !businessProfile) return null;

  return {
    organization: { id: org.id, businessType: org.business_type, timezone: org.timezone, status: org.status },
    agentConfig: agentConfig as AgentConfig,
    businessProfile: businessProfile as BusinessProfile,
    services: (services ?? []) as Service[],
    resources: (resources ?? []) as Resource[],
    hours: (hours ?? []) as BusinessHourPeriod[],
    resourceHours: (resourceHours ?? []) as ResourceHours[],
    blocks: (blocks ?? []) as AgendaBlock[],
    agentRules: (agentRules ?? []) as AgentRule[],
    customer: (customerResult.data as Customer | null) ?? null,
    googleCalendarConnected: googleIntegration?.status === "connected"
  };
}

/**
 * Construye el system prompt dinámicamente. El agente NUNCA está hardcodeado
 * para un rubro específico: toda referencia al tipo de negocio, nombre y
 * datos viene de la configuración cargada en runtime (punto 21 del prompt).
 *
 * Orden pensado para el costo: todo lo que es fijo para el negocio va
 * primero y lo que cambia en cada mensaje (la hora y el cliente) va al
 * final. OpenAI cobra a mitad de precio el comienzo de las instrucciones
 * cuando se repite idéntico entre llamadas (caché de prompts, desde 1024
 * tokens), y la hora en el medio lo cortaba ahí. No muevas datos que
 * cambian por mensaje hacia arriba.
 */
export function buildSystemPrompt(data: AgentPromptData, nowUtc: Date): string {
  const { agentConfig, businessProfile, organization } = data;
  const nowLocal = formatNow(nowUtc, organization.timezone);
  const resourceHoursText = formatResourceHours(data.resources, data.resourceHours);

  const toneLine =
    agentConfig.tone === "formal"
      ? "Mantené un tono formal y profesional."
      : agentConfig.tone === "casual"
        ? "Mantené un tono casual y cercano."
        : "Mantené un tono amable y cercano (friendly).";

  const guidance = businessTypeGuidance(organization.businessType);
  const guidanceSection = guidance
    ? `\n\nGUÍA PARA ESTE TIPO DE NEGOCIO (${businessTypeLabel(organization.businessType)}; no puede contradecir las reglas anteriores):\n${guidance}`
    : "";

  return `Sos ${agentConfig.name}, el asistente virtual de ${businessProfile.name}.

INFORMACIÓN DEL NEGOCIO:
- Tipo de negocio: ${businessTypeLabel(organization.businessType)}
- Nombre: ${businessProfile.name}
- Descripción: ${businessProfile.description ?? "No especificada"}
- Teléfono: ${businessProfile.phone ?? "No especificado"}
- Política de cancelación: ${businessProfile.cancellation_policy ?? "No especificada"}
- Instrucciones especiales: ${businessProfile.special_instructions ?? "Ninguna"}
- Zona horaria: ${organization.timezone}

UBICACIÓN:
${formatLocation(businessProfile)}

HORARIOS DE ATENCIÓN (semana normal; lo que no figura como abierto está cerrado):
${formatWeeklyHours(data.hours)}

SERVICIOS DISPONIBLES:
${formatServices(data.services)}

RECURSOS:
${formatResources(data.resources)}${
    resourceHoursText
      ? `\n\nHORARIO PROPIO DEL PERSONAL / RECURSOS (solo atienden en estas franjas, aunque el negocio esté abierto más horas):\n${resourceHoursText}`
      : ""
  }

PAGOS: ${formatPaymentPolicy(businessProfile)}

INTEGRACIÓN DE CALENDARIO: ${
    data.googleCalendarConnected
      ? "Google Calendar está conectado: cada reserva queda también en el calendario del negocio."
      : "Google Calendar no está conectado. El correo de confirmación al cliente sale igual (ver regla 22)."
  }

IDIOMA: ${agentConfig.language}. ${toneLine}

CAPACIDADES HABILITADAS:
- Crear reservas: ${agentConfig.booking_enabled ? "sí" : "no"}
- Cancelar reservas: ${agentConfig.cancellation_enabled ? "sí" : "no"}
- Reprogramar reservas: ${agentConfig.rescheduling_enabled ? "sí" : "no"}

${CORE_AGENT_RULES}${guidanceSection}

INSTRUCCIONES PERSONALIZADAS DEL NEGOCIO (no pueden contradecir las reglas anteriores):
${agentConfig.system_instructions ?? "Ninguna."}

REGLAS ADICIONALES DEL NEGOCIO:
${formatAgentRules(data.agentRules)}

FECHA Y HORA ACTUAL DEL NEGOCIO: ${nowLocal} (${organization.timezone})

CALENDARIO DE LOS PRÓXIMOS ${UPCOMING_DAYS} DÍAS (ya resuelto con fecha, día de la semana, horario y bloqueos; usalo para "hoy", "mañana", "el viernes" o "cuándo vuelven a abrir"):
${formatUpcomingDays(nowUtc, organization.timezone, data.hours, data.blocks)}

${formatCurrentCustomer(data.customer)}`;
}

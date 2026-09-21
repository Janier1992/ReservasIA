import { formatInTimeZone } from "date-fns-tz";
import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import { CORE_AGENT_RULES } from "./coreRules.js";
import type { AgentConfig, AgentRule, BusinessHourPeriod, BusinessProfile, Customer, Resource, Service } from "../../types/domain.js";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatHours(periods: BusinessHourPeriod[]): string {
  if (periods.length === 0) return "No hay horarios configurados.";

  const byDay = new Map<number, BusinessHourPeriod[]>();
  for (const p of periods) {
    if (!byDay.has(p.day_of_week)) byDay.set(p.day_of_week, []);
    byDay.get(p.day_of_week)!.push(p);
  }

  const lines: string[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const dayPeriods = byDay.get(dow);
    if (!dayPeriods || dayPeriods.length === 0) continue;
    if (dayPeriods.every((p) => p.is_closed)) {
      lines.push(`- ${DAY_NAMES[dow]}: cerrado`);
      continue;
    }
    const ranges = dayPeriods
      .filter((p) => !p.is_closed)
      .map((p) => `${p.opening_time?.slice(0, 5)}-${p.closing_time?.slice(0, 5)}`)
      .join(", ");
    lines.push(`- ${DAY_NAMES[dow]}: ${ranges}`);
  }
  return lines.join("\n");
}

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
  agentRules: AgentRule[];
  customer: Customer | null;
  googleCalendarConnected: boolean;
}

export async function loadAgentPromptData(organizationId: string, customerId: string | null): Promise<AgentPromptData> {
  const [
    { data: org },
    { data: agentConfig },
    { data: businessProfile },
    { data: services },
    { data: resources },
    { data: hours },
    { data: agentRules },
    customerResult,
    { data: googleIntegration }
  ] = await Promise.all([
    insforgeAdmin.database.from("organizations").select("id, business_type, timezone, status").eq("id", organizationId).maybeSingle(),
    insforgeAdmin.database.from("agents").select("*").eq("organization_id", organizationId).maybeSingle(),
    insforgeAdmin.database.from("business_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
    insforgeAdmin.database.from("services").select("*").eq("organization_id", organizationId).eq("is_active", true),
    insforgeAdmin.database.from("resources").select("*").eq("organization_id", organizationId).eq("is_active", true),
    insforgeAdmin.database.from("business_hour_periods").select("*").eq("organization_id", organizationId),
    insforgeAdmin.database.from("agent_rules").select("*").eq("organization_id", organizationId).eq("enabled", true),
    customerId
      ? insforgeAdmin.database.from("customers").select("*").eq("id", customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    insforgeAdmin.database
      .from("integrations")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("provider", "google_calendar")
      .maybeSingle()
  ]);

  if (!org || !agentConfig || !businessProfile) {
    throw new AppError(ErrorCodes.ORGANIZATION_NOT_FOUND, "La organización no está completamente configurada.", 404);
  }

  return {
    organization: { id: org.id, businessType: org.business_type, timezone: org.timezone, status: org.status },
    agentConfig: agentConfig as AgentConfig,
    businessProfile: businessProfile as BusinessProfile,
    services: (services ?? []) as Service[],
    resources: (resources ?? []) as Resource[],
    hours: (hours ?? []) as BusinessHourPeriod[],
    agentRules: (agentRules ?? []) as AgentRule[],
    customer: (customerResult.data as Customer | null) ?? null,
    googleCalendarConnected: googleIntegration?.status === "connected"
  };
}

/**
 * Construye el system prompt dinámicamente. El agente NUNCA está hardcodeado
 * para un rubro específico: toda referencia al tipo de negocio, nombre y
 * datos viene de la configuración cargada en runtime (punto 21 del prompt).
 */
export function buildSystemPrompt(data: AgentPromptData, nowUtc: Date): string {
  const { agentConfig, businessProfile, organization } = data;
  const nowLocal = formatInTimeZone(nowUtc, organization.timezone, "EEEE d 'de' MMMM yyyy, HH:mm");

  const toneLine =
    agentConfig.tone === "formal"
      ? "Mantené un tono formal y profesional."
      : agentConfig.tone === "casual"
        ? "Mantené un tono casual y cercano."
        : "Mantené un tono amable y cercano (friendly).";

  return `Sos ${agentConfig.name}, el asistente virtual de ${businessProfile.name}.

INFORMACIÓN DEL NEGOCIO:
- Tipo de negocio: ${organization.businessType}
- Nombre: ${businessProfile.name}
- Descripción: ${businessProfile.description ?? "No especificada"}
- Dirección: ${businessProfile.address ?? "No especificada"}
- Teléfono: ${businessProfile.phone ?? "No especificado"}
- Política de cancelación: ${businessProfile.cancellation_policy ?? "No especificada"}
- Instrucciones especiales: ${businessProfile.special_instructions ?? "Ninguna"}
- Zona horaria: ${organization.timezone}

HORARIOS DE ATENCIÓN:
${formatHours(data.hours)}

SERVICIOS DISPONIBLES:
${formatServices(data.services)}

RECURSOS:
${formatResources(data.resources)}

PAGOS: ${formatPaymentPolicy(businessProfile)}

INTEGRACIÓN DE CALENDARIO: ${
    data.googleCalendarConnected
      ? "Google Calendar está conectado. Podés pedir el email del cliente (OPCIONAL, campo email_cliente) para mandarle la invitación del turno directamente a su propio Google Calendar."
      : "Google Calendar no está conectado. No pidas el email del cliente para esto."
  }

FECHA Y HORA ACTUAL DEL NEGOCIO: ${nowLocal} (${organization.timezone})

${data.customer ? `CLIENTE ACTUAL: ${data.customer.name ?? "Sin nombre registrado"}, teléfono ${data.customer.phone ?? "N/D"}.` : "CLIENTE ACTUAL: aún no identificado."}

IDIOMA: ${agentConfig.language}. ${toneLine}

CAPACIDADES HABILITADAS:
- Crear reservas: ${agentConfig.booking_enabled ? "sí" : "no"}
- Cancelar reservas: ${agentConfig.cancellation_enabled ? "sí" : "no"}
- Reprogramar reservas: ${agentConfig.rescheduling_enabled ? "sí" : "no"}

${CORE_AGENT_RULES}

INSTRUCCIONES PERSONALIZADAS DEL NEGOCIO (no pueden contradecir las reglas anteriores):
${agentConfig.system_instructions ?? "Ninguna."}

REGLAS ADICIONALES DEL NEGOCIO:
${formatAgentRules(data.agentRules)}`;
}

import { z } from "zod";
import type OpenAI from "openai";
import type { AgentConfig } from "../../types/domain.js";

export const ToolName = {
  ConsultarDisponibilidad: "consultar_disponibilidad",
  ObtenerInfoNegocio: "obtener_info_negocio",
  ConsultarServicios: "consultar_servicios",
  ConsultarReservasCliente: "consultar_reservas_cliente",
  CrearReserva: "crear_reserva",
  CancelarReserva: "cancelar_reserva",
  ReprogramarReserva: "reprogramar_reserva"
} as const;

export type ToolNameType = (typeof ToolName)[keyof typeof ToolName];

// ------------------------------------------------------------------
// Esquemas de validación de argumentos (punto 45: validar tool arguments)
// ------------------------------------------------------------------

export const consultarDisponibilidadSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe tener formato YYYY-MM-DD"),
  hora_preferida: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "hora_preferida debe tener formato HH:mm")
    .optional(),
  cantidad_personas: z.number().int().positive().max(100).optional(),
  service_id: z.string().uuid().optional(),
  resource_id: z.string().uuid().optional()
});

export const obtenerInfoNegocioSchema = z.object({});

export const consultarServiciosSchema = z.object({});

export const consultarReservasClienteSchema = z.object({
  telefono: z.string().min(5).max(30).optional()
});

export const crearReservaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe tener formato YYYY-MM-DD"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "hora debe tener formato HH:mm"),
  nombre_cliente: z.string().min(1).max(200),
  telefono_cliente: z.string().min(5).max(30),
  email_cliente: z.string().email().max(200).optional(),
  cantidad_personas: z.number().int().positive().max(100).optional(),
  service_id: z.string().uuid().optional(),
  resource_id: z.string().uuid().optional(),
  notas: z.string().max(1000).optional(),
  metodo_pago: z.enum(["anticipado", "en_sitio"]).optional()
});

export const cancelarReservaSchema = z.object({
  reservation_id: z.string().uuid()
});

export const reprogramarReservaSchema = z.object({
  reservation_id: z.string().uuid(),
  nueva_fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "nueva_fecha debe tener formato YYYY-MM-DD"),
  nueva_hora: z.string().regex(/^\d{2}:\d{2}$/, "nueva_hora debe tener formato HH:mm")
});

const ALL_TOOL_DEFINITIONS: Record<ToolNameType, OpenAI.Chat.Completions.ChatCompletionTool> = {
  [ToolName.ConsultarDisponibilidad]: {
    type: "function",
    function: {
      name: ToolName.ConsultarDisponibilidad,
      description:
        "Consulta la disponibilidad real de turnos/mesas/recursos para una fecha dada. SIEMPRE debe llamarse antes de prometer un horario.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha concreta en formato YYYY-MM-DD (zona horaria del negocio)." },
          hora_preferida: { type: "string", description: "Hora preferida en formato HH:mm, opcional." },
          cantidad_personas: { type: "number", description: "Cantidad de personas, si aplica." },
          service_id: { type: "string", description: "ID del servicio solicitado, si se conoce." },
          resource_id: { type: "string", description: "ID del recurso preferido, si se conoce." }
        },
        required: ["fecha"]
      }
    }
  },
  [ToolName.ObtenerInfoNegocio]: {
    type: "function",
    function: {
      name: ToolName.ObtenerInfoNegocio,
      description: "Devuelve información pública y operativa del negocio (dirección, teléfono, políticas, horarios).",
      parameters: { type: "object", properties: {} }
    }
  },
  [ToolName.ConsultarServicios]: {
    type: "function",
    function: {
      name: ToolName.ConsultarServicios,
      description: "Devuelve el catálogo de servicios activos del negocio con duración y precio.",
      parameters: { type: "object", properties: {} }
    }
  },
  [ToolName.ConsultarReservasCliente]: {
    type: "function",
    function: {
      name: ToolName.ConsultarReservasCliente,
      description: "Busca las reservas activas (pending/confirmed) del cliente actual de la conversación.",
      parameters: {
        type: "object",
        properties: {
          telefono: { type: "string", description: "Teléfono del cliente, si es distinto al de la conversación." }
        }
      }
    }
  },
  [ToolName.CrearReserva]: {
    type: "function",
    function: {
      name: ToolName.CrearReserva,
      description:
        "Crea una reserva definitiva. SOLO debe llamarse después de tener todos los datos obligatorios y una confirmación EXPLÍCITA del cliente.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha concreta YYYY-MM-DD." },
          hora: { type: "string", description: "Hora concreta HH:mm." },
          nombre_cliente: { type: "string" },
          telefono_cliente: { type: "string" },
          email_cliente: {
            type: "string",
            description:
              "Email del cliente, OPCIONAL. Si el negocio tiene Google Calendar conectado y el cliente lo proporciona, se le manda la invitación del turno a su propio Google Calendar."
          },
          cantidad_personas: { type: "number" },
          service_id: { type: "string" },
          resource_id: { type: "string" },
          notas: { type: "string" },
          metodo_pago: {
            type: "string",
            enum: ["anticipado", "en_sitio"],
            description:
              "Solo si la sección PAGOS indica que el negocio pide anticipo. 'anticipado' si el cliente va a pagar por Nequi antes del turno, 'en_sitio' si prefiere pagar presencialmente. Si el anticipo es obligatorio, siempre 'anticipado'."
          }
        },
        required: ["fecha", "hora", "nombre_cliente", "telefono_cliente"]
      }
    }
  },
  [ToolName.CancelarReserva]: {
    type: "function",
    function: {
      name: ToolName.CancelarReserva,
      description: "Cancela una reserva existente por su ID (obtenido previamente vía consultar_reservas_cliente).",
      parameters: {
        type: "object",
        properties: { reservation_id: { type: "string" } },
        required: ["reservation_id"]
      }
    }
  },
  [ToolName.ReprogramarReserva]: {
    type: "function",
    function: {
      name: ToolName.ReprogramarReserva,
      description: "Reprograma una reserva existente a una nueva fecha/hora, revalidando disponibilidad.",
      parameters: {
        type: "object",
        properties: {
          reservation_id: { type: "string" },
          nueva_fecha: { type: "string" },
          nueva_hora: { type: "string" }
        },
        required: ["reservation_id", "nueva_fecha", "nueva_hora"]
      }
    }
  }
};

/**
 * El catálogo de servicios/recursos varía por negocio: si el negocio tiene
 * servicios o recursos configurados, la reserva debe quedar asociada a uno
 * de ellos (para que el dashboard pueda mostrar esa información y el
 * negocio sepa qué se reservó), así que esos campos pasan de opcionales a
 * obligatorios en el esquema que ve el modelo. Si el negocio no configuró
 * servicios/recursos, se dejan opcionales como antes.
 */
function buildCrearReservaTool(hasServices: boolean, hasResources: boolean): OpenAI.Chat.Completions.ChatCompletionTool {
  const base = ALL_TOOL_DEFINITIONS[ToolName.CrearReserva];
  const required = [...(base.function.parameters!.required as string[])];
  if (hasServices) required.push("service_id");
  if (hasResources) required.push("resource_id");
  return {
    ...base,
    function: {
      ...base.function,
      parameters: { ...base.function.parameters, required }
    }
  };
}

/**
 * Sólo se ofrecen al modelo las herramientas habilitadas por la
 * configuración del agente. `previewMode` se usa desde la vista previa de
 * conversación del dashboard (punto 37) para permitir probar el agente sin
 * riesgo de que cree, cancele o reprograme reservas reales.
 */
export function getToolDefinitionsForAgent(
  agentConfig: AgentConfig,
  options?: { previewMode?: boolean; hasServices?: boolean; hasResources?: boolean }
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const names: ToolNameType[] = [
    ToolName.ObtenerInfoNegocio,
    ToolName.ConsultarServicios,
    ToolName.ConsultarDisponibilidad,
    ToolName.ConsultarReservasCliente
  ];
  const bookingEnabled = !options?.previewMode && agentConfig.booking_enabled;
  if (!options?.previewMode) {
    if (agentConfig.cancellation_enabled) names.push(ToolName.CancelarReserva);
    if (agentConfig.rescheduling_enabled) names.push(ToolName.ReprogramarReserva);
  }
  const tools = names.map((n) => ALL_TOOL_DEFINITIONS[n]);
  if (bookingEnabled) {
    tools.push(buildCrearReservaTool(Boolean(options?.hasServices), Boolean(options?.hasResources)));
  }
  return tools;
}

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
  ReprogramarReserva: "reprogramar_reserva",
  GuardarEmailCliente: "guardar_email_cliente"
} as const;

export type ToolNameType = (typeof ToolName)[keyof typeof ToolName];

// ------------------------------------------------------------------
// Esquemas de validación de argumentos (punto 45: validar tool arguments)
// ------------------------------------------------------------------

/** Algunos modelos mandan null en los campos opcionales que no usan: se toman como ausentes. */
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === null ? undefined : v), schema.optional());

/**
 * Los modelos no siempre respetan el formato exacto ("9:00", "15:00:00",
 * "3:30 pm", "2026-11-07T15:00"). Se normaliza antes de validar para que un
 * detalle de formato no deje al cliente sin su reserva.
 */
export function normalizeDate(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const match = v.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  return match ? match[1] : v.trim();
}

export function normalizeTime(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const raw = v.trim().toLowerCase();
  const match = raw.match(/^(\d{1,2})(?:[:.h](\d{2}))?(?::\d{2})?\s*(?:([ap])\.?\s*m\.?)?$/);
  if (!match) return v.trim();
  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  if (match[3] === "p" && hour < 12) hour += 12;
  if (match[3] === "a" && hour === 12) hour = 0;
  if (!match[2] && !match[3]) return v.trim(); // "15" solo es ambiguo: que el modelo lo aclare
  if (hour > 23 || Number(minute) > 59) return v.trim();
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/** Un número que llega como texto ("2") se toma como número. */
function toNumber(v: unknown): unknown {
  return typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
}

const dateField = (name: string) => z.preprocess(normalizeDate, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${name} debe tener formato YYYY-MM-DD`));
const timeField = (name: string) => z.preprocess(normalizeTime, z.string().regex(/^\d{2}:\d{2}$/, `${name} debe tener formato HH:mm (24 horas)`));
const countField = (max: number, min = 1) => optional(z.preprocess(toNumber, z.number().int().min(min).max(max)));
const uuidField = (name: string) =>
  optional(z.string().uuid(`${name} debe ser el id exacto que devolvió consultar_servicios (no el nombre)`));

export const consultarDisponibilidadSchema = z.object({
  fecha: dateField("fecha"),
  hora_preferida: optional(timeField("hora_preferida")),
  cantidad_personas: countField(100),
  service_id: uuidField("service_id"),
  resource_id: uuidField("resource_id")
});

// Sin argumentos a propósito: siempre son las reservas del cliente de la
// conversación, nunca las de un teléfono que alguien escriba en el chat.
export const consultarReservasClienteSchema = z.object({});

export const crearReservaSchema = z.object({
  fecha: dateField("fecha"),
  hora: timeField("hora"),
  nombre_cliente: z.string().trim().min(1, "nombre_cliente es obligatorio: pedíselo al cliente").max(200),
  // En WhatsApp/Telegram el cliente ya está identificado por la conversación y
  // este dato no se usa; en Telegram ni siquiera hay número. Exigirlo hacía que
  // la reserva fallara si el modelo lo mandaba vacío.
  telefono_cliente: optional(z.string().max(30)),
  // Sin .email() a propósito: un correo mal escrito ("ana@gmail.com." o con un
  // espacio) no puede tumbar la reserva entera. Se normaliza y valida en el
  // ejecutor con normalizeEmail; si no sirve, la reserva se crea igual y el
  // agente recibe el aviso para pedirlo de nuevo.
  email_cliente: optional(z.string().max(200)),
  cantidad_personas: countField(100),
  service_id: uuidField("service_id"),
  resource_id: uuidField("resource_id"),
  notas: optional(z.string().max(1000)),
  metodo_pago: optional(z.enum(["anticipado", "en_sitio"])),
  repetir_semanas: countField(12, 2)
});

export const guardarEmailClienteSchema = z.object({
  email: z.string().min(3).max(200)
});

const emailSchema = z.string().email().max(200);

/**
 * Deja un correo dictado por chat listo para guardar: sin espacios, en
 * minúsculas, sin "mailto:", sin <> ni la puntuación que se pega al final de
 * una frase ("es ana@gmail.com."). Devuelve null si igual no es un correo.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/[<>"'\s]/g, "")
    .replace(/[.,;:!?)\]]+$/, "")
    .replace(/^[([]+/, "")
    .toLowerCase();
  return emailSchema.safeParse(cleaned).success ? cleaned : null;
}

export const cancelarReservaSchema = z.object({
  reservation_id: z.string().uuid("reservation_id debe ser el id que devolvió consultar_reservas_cliente")
});

export const reprogramarReservaSchema = z.object({
  reservation_id: z.string().uuid("reservation_id debe ser el id que devolvió consultar_reservas_cliente"),
  nueva_fecha: dateField("nueva_fecha"),
  nueva_hora: timeField("nueva_hora")
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
      parameters: { type: "object", properties: {} }
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
          telefono_cliente: {
            type: "string",
            description: "Opcional: el cliente de la conversación ya está identificado. No se lo pidas solo para esto."
          },
          email_cliente: {
            type: "string",
            description:
              "Email del cliente, OPCIONAL. Si lo da, le llega el correo de confirmación de la reserva con un botón para agregarla a su calendario."
          },
          cantidad_personas: { type: "number" },
          service_id: { type: "string" },
          resource_id: { type: "string" },
          notas: {
            type: "string",
            description:
              "Datos adicionales útiles para el negocio que el cliente haya dado (ej: motivo de la consulta, nombre y especie de la mascota, marca/modelo/placa del vehículo, nombre y nivel del estudiante, ocasión especial)."
          },
          metodo_pago: {
            type: "string",
            enum: ["anticipado", "en_sitio"],
            description:
              "Solo si la sección PAGOS indica que el negocio pide anticipo. 'anticipado' si el cliente va a pagar por Nequi antes del turno, 'en_sitio' si prefiere pagar presencialmente. Si el anticipo es obligatorio, siempre 'anticipado'."
          },
          repetir_semanas: {
            type: "number",
            description:
              "SOLO si el cliente pidió explícitamente reservar el mismo horario todas las semanas (ej. una clase fija). Cantidad total de semanas a reservar, incluyendo la primera (mínimo 2, máximo 12). Si alguna semana no tiene cupo, esa fecha se informa como no reservada en el resultado; las demás sí quedan reservadas."
          }
        },
        required: ["fecha", "hora", "nombre_cliente"]
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
  [ToolName.GuardarEmailCliente]: {
    type: "function",
    function: {
      name: ToolName.GuardarEmailCliente,
      description:
        "Guarda el correo del cliente de esta conversación y le manda la confirmación de sus próximas reservas a ese correo. SOLO cuando la reserva YA EXISTE: si el cliente da o corrige su email después de reservar, o crear_reserva devolvió email_no_guardado y lo escribió de nuevo. Si todavía no reservó, NO la uses: pasá el correo en email_cliente de crear_reserva.",
      parameters: {
        type: "object",
        properties: { email: { type: "string", description: "Email del cliente tal como lo escribió." } },
        required: ["email"]
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
    names.push(ToolName.GuardarEmailCliente);
  }
  const tools = names.map((n) => ALL_TOOL_DEFINITIONS[n]);
  if (bookingEnabled) {
    tools.push(buildCrearReservaTool(Boolean(options?.hasServices), Boolean(options?.hasResources)));
  }
  return tools;
}

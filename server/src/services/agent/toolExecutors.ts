import { addMinutes, differenceInMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError } from "../../utils/AppError.js";
import { getAvailableSlots } from "../availability/availabilityService.js";
import { findOrCreateCustomerByPhone, getCustomerActiveReservations } from "../customers/customersService.js";
import { createReservation, cancelReservation, getReservationById, rescheduleReservation } from "../reservations/reservationsService.js";
import {
  ToolName,
  type ToolNameType,
  cancelarReservaSchema,
  consultarDisponibilidadSchema,
  consultarReservasClienteSchema,
  crearReservaSchema,
  reprogramarReservaSchema
} from "./tools.js";

export interface AgentExecutionContext {
  organizationId: string;
  conversationId: string;
  timezone: string;
  customerPhone: string;
  customerId: string | null;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error_code?: string;
  message?: string;
}

function toResult(fn: () => Promise<unknown>): Promise<ToolExecutionResult> {
  return fn()
    .then((data) => ({ success: true, data }))
    .catch((err) => {
      if (err instanceof AppError) {
        return { success: false, error_code: err.code, message: err.message };
      }
      return { success: false, error_code: "INTERNAL_ERROR", message: "Ocurrió un error interno." };
    });
}

function sortByProximity(slots: { start: string }[], preferredTime: string | undefined, date: string) {
  if (!preferredTime) return slots;
  const target = new Date(`${date}T${preferredTime}:00Z`).getTime();
  return [...slots].sort((a, b) => Math.abs(new Date(a.start).getTime() - target) - Math.abs(new Date(b.start).getTime() - target));
}

async function executeConsultarDisponibilidad(rawArgs: unknown, ctx: AgentExecutionContext) {
  const args = consultarDisponibilidadSchema.parse(rawArgs);
  return toResult(async () => {
    const { slots, reason, timezone } = await getAvailableSlots({
      organizationId: ctx.organizationId,
      date: args.fecha,
      serviceId: args.service_id,
      resourceId: args.resource_id,
      partySize: args.cantidad_personas
    });
    const sorted = sortByProximity(slots, args.hora_preferida, args.fecha).slice(0, 8);
    return { available: sorted.length > 0, slots: sorted, reason: sorted.length === 0 ? reason ?? "Sin cupos disponibles ese día." : undefined, timezone };
  });
}

async function executeObtenerInfoNegocio(_rawArgs: unknown, ctx: AgentExecutionContext) {
  return toResult(async () => {
    const { data, error } = await insforgeAdmin.database
      .from("business_profiles")
      .select(
        "name, description, address, phone, email, website, currency, cancellation_policy, special_instructions, deposit_enabled, deposit_mandatory, deposit_percentage, nequi_phone"
      )
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (error || !data) throw new AppError("ORGANIZATION_NOT_FOUND", "No se encontró información del negocio.", 404);
    return data;
  });
}

async function executeConsultarServicios(_rawArgs: unknown, ctx: AgentExecutionContext) {
  return toResult(async () => {
    const { data, error } = await insforgeAdmin.database
      .from("services")
      .select("id, name, description, duration_minutes, price, currency")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true);
    if (error) throw new AppError("INTERNAL_ERROR", "No se pudieron obtener los servicios.", 500);
    return data ?? [];
  });
}

async function executeConsultarReservasCliente(rawArgs: unknown, ctx: AgentExecutionContext) {
  const args = consultarReservasClienteSchema.parse(rawArgs);
  return toResult(async () => {
    const phone = args.telefono ?? ctx.customerPhone;
    const { data: customer } = await insforgeAdmin.database
      .from("customers")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("phone", phone)
      .maybeSingle();

    if (!customer) return [];
    const reservations = await getCustomerActiveReservations(ctx.organizationId, customer.id);
    return reservations.map((r) => ({
      id: r.id,
      start_at: r.start_at,
      end_at: r.end_at,
      status: r.status,
      party_size: r.party_size,
      customer_name: r.customer_name
    }));
  });
}

async function executeCrearReserva(rawArgs: unknown, ctx: AgentExecutionContext) {
  const args = crearReservaSchema.parse(rawArgs);
  return toResult(async () => {
    let durationMinutes = 60;
    let servicePrice: number | null = null;

    const { data: profile } = await insforgeAdmin.database
      .from("business_profiles")
      .select("reservation_duration_minutes, deposit_enabled, deposit_mandatory, deposit_percentage, nequi_phone")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    if (args.service_id) {
      const { data: service } = await insforgeAdmin.database
        .from("services")
        .select("duration_minutes, price")
        .eq("organization_id", ctx.organizationId)
        .eq("id", args.service_id)
        .maybeSingle();
      if (service) {
        durationMinutes = service.duration_minutes;
        servicePrice = service.price;
      }
    } else if (profile) {
      durationMinutes = profile.reservation_duration_minutes;
    }

    const startAt = fromZonedTime(`${args.fecha}T${args.hora}:00`, ctx.timezone);
    const endAt = addMinutes(startAt, durationMinutes);

    const customer = await findOrCreateCustomerByPhone(
      ctx.organizationId,
      args.telefono_cliente,
      args.nombre_cliente,
      args.email_cliente
    );

    const reservation = await createReservation({
      organizationId: ctx.organizationId,
      customerId: customer.id,
      serviceId: args.service_id ?? null,
      resourceId: args.resource_id ?? null,
      conversationId: ctx.conversationId,
      startAt,
      endAt,
      partySize: args.cantidad_personas ?? null,
      customerName: args.nombre_cliente,
      specialRequests: args.notas ?? null,
      source: "whatsapp"
    });

    // El anticipo se resuelve DESPUÉS de crear la reserva (nunca antes, para
    // no bloquear la reserva en sí si algo de esto falla) y siempre lo
    // calcula el servidor con el precio real del servicio — el agente nunca
    // recibe el permiso de inventar ni de calcular este monto (punto 25 de
    // las reglas del agente).
    const depositApplies =
      profile?.deposit_enabled && profile.deposit_percentage && (profile.deposit_mandatory || args.metodo_pago === "anticipado");

    if (depositApplies && profile) {
      const depositAmount = servicePrice !== null ? Math.round((servicePrice * profile.deposit_percentage!) / 100) : null;
      try {
        await insforgeAdmin.database
          .from("reservations")
          .update({ payment_status: "awaiting_payment", deposit_amount: depositAmount })
          .eq("id", reservation.id);
      } catch {
        // Best-effort: si esto falla, la reserva ya quedó creada; el negocio
        // puede resolver el cobro manualmente. No queremos que un anticipo
        // fallido tumbe la reserva completa.
      }
      return {
        id: reservation.id,
        start_at: reservation.start_at,
        end_at: reservation.end_at,
        status: reservation.status,
        payment_status: "awaiting_payment" as const,
        deposit_amount: depositAmount,
        nequi_phone: profile.nequi_phone
      };
    }

    return {
      id: reservation.id,
      start_at: reservation.start_at,
      end_at: reservation.end_at,
      status: reservation.status,
      payment_status: "not_required" as const
    };
  });
}

async function executeCancelarReserva(rawArgs: unknown, ctx: AgentExecutionContext) {
  const args = cancelarReservaSchema.parse(rawArgs);
  return toResult(async () => {
    // Verifica ownership explícitamente: nunca confiar en que el reservation_id
    // que el modelo repite pertenezca realmente a esta organización.
    await getReservationById(ctx.organizationId, args.reservation_id);
    const reservation = await cancelReservation(args.reservation_id);
    return { id: reservation.id, status: reservation.status };
  });
}

async function executeReprogramarReserva(rawArgs: unknown, ctx: AgentExecutionContext) {
  const args = reprogramarReservaSchema.parse(rawArgs);
  return toResult(async () => {
    const existing = await getReservationById(ctx.organizationId, args.reservation_id);
    const durationMinutes = differenceInMinutes(new Date(existing.end_at), new Date(existing.start_at));
    const newStart = fromZonedTime(`${args.nueva_fecha}T${args.nueva_hora}:00`, ctx.timezone);
    const newEnd = addMinutes(newStart, durationMinutes);

    const reservation = await rescheduleReservation(args.reservation_id, newStart, newEnd);
    return { id: reservation.id, start_at: reservation.start_at, end_at: reservation.end_at, status: reservation.status };
  });
}

const EXECUTORS: Record<ToolNameType, (args: unknown, ctx: AgentExecutionContext) => Promise<ToolExecutionResult>> = {
  [ToolName.ConsultarDisponibilidad]: executeConsultarDisponibilidad,
  [ToolName.ObtenerInfoNegocio]: executeObtenerInfoNegocio,
  [ToolName.ConsultarServicios]: executeConsultarServicios,
  [ToolName.ConsultarReservasCliente]: executeConsultarReservasCliente,
  [ToolName.CrearReserva]: executeCrearReserva,
  [ToolName.CancelarReserva]: executeCancelarReserva,
  [ToolName.ReprogramarReserva]: executeReprogramarReserva
};

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: AgentExecutionContext
): Promise<ToolExecutionResult> {
  const executor = EXECUTORS[name as ToolNameType];
  if (!executor) {
    return { success: false, error_code: "UNKNOWN_TOOL", message: `Herramienta desconocida: ${name}` };
  }
  try {
    return await executor(rawArgs, ctx);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return { success: false, error_code: "VALIDATION_ERROR", message: "Argumentos inválidos para la herramienta." };
    }
    throw err;
  }
}

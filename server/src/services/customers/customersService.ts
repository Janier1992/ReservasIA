import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import type { Customer } from "../../types/domain.js";

/**
 * Busca un cliente por organización + teléfono (identificación primaria
 * quando viene de WhatsApp) y lo crea si no existe. El índice único parcial
 * `uq_customers_org_phone` es la garantía real contra duplicados; si dos
 * mensajes concurrentes disparan la creación al mismo tiempo, el segundo
 * INSERT falla con 23505 y simplemente releemos la fila ganadora.
 */
export async function findOrCreateCustomerByPhone(
  organizationId: string,
  phone: string,
  name?: string,
  email?: string
): Promise<Customer> {
  const { data: existing, error: selectError } = await insforgeAdmin.database
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();

  if (selectError) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo buscar el cliente.", 500);
  if (existing) {
    // Sólo completa datos que faltan (no pisa un nombre/email ya guardado
    // con uno distinto que el cliente diga de pasada en otra conversación).
    const patch: Partial<Pick<Customer, "name" | "email">> = {};
    if (name && !existing.name) patch.name = name;
    if (email && !existing.email) patch.email = email;
    if (Object.keys(patch).length > 0) {
      await updateCustomer(organizationId, existing.id, patch);
      return { ...(existing as Customer), ...patch };
    }
    return existing as Customer;
  }

  const { data: created, error: insertError } = await insforgeAdmin.database
    .from("customers")
    .insert([{ organization_id: organizationId, phone, name: name ?? null, email: email ?? null }])
    .select("*")
    .single();

  if (!insertError) return created as Customer;

  if (insertError.code === "23505") {
    const { data: winner, error: refetchError } = await insforgeAdmin.database
      .from("customers")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("phone", phone)
      .single();
    if (refetchError) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo obtener el cliente.", 500);
    return winner as Customer;
  }

  throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudo crear el cliente.", 500);
}

/**
 * Completa nombre/email del cliente que ya está resuelto por la
 * conversación (`ctx.customerId`), sin pisar datos ya guardados. Se usa al
 * crear una reserva en vez de buscar/crear un cliente por el teléfono que
 * el cliente tipeó en el chat: para Telegram ese teléfono real es distinto
 * del identificador de la conversación (`telegram:<chat_id>`), así que
 * buscar por ese valor crearía un cliente duplicado, desconectado del que
 * aparece en el Inbox y de sus reservas anteriores.
 */
export async function ensureCustomerDetails(
  organizationId: string,
  customerId: string,
  name?: string,
  email?: string
): Promise<Customer> {
  const { data: existing, error } = await insforgeAdmin.database
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .maybeSingle();

  if (error || !existing) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, "No se encontró el cliente de la conversación.", 404);

  const patch: Partial<Pick<Customer, "name" | "email">> = {};
  if (name && !existing.name) patch.name = name;
  if (email && !existing.email) patch.email = email;
  if (Object.keys(patch).length === 0) return existing as Customer;

  return updateCustomer(organizationId, customerId, patch);
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  patch: Partial<Pick<Customer, "name" | "email" | "notes">>
): Promise<Customer> {
  const { data, error } = await insforgeAdmin.database
    .from("customers")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .select("*")
    .single();

  if (error || !data) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, "No se pudo actualizar el cliente.", 404);
  return data as Customer;
}

export async function getCustomerActiveReservations(organizationId: string, customerId: string) {
  const { data, error } = await insforgeAdmin.database
    .from("reservations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .in("status", ["pending", "confirmed"])
    .order("start_at", { ascending: true });

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudieron cargar las reservas del cliente.", 500);
  return data ?? [];
}

import type { CustomerPlan, PackagePlan, PlanKind } from "@/types/domain";

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  sessions: "Bono de sesiones",
  membership: "Membresía",
  stamps: "Tarjeta de sellos"
};

export const PLAN_KIND_HELP: Record<PlanKind, string> = {
  sessions: "El cliente paga N sesiones por adelantado; cada atención completada descuenta una.",
  membership: "Atenciones ilimitadas mientras esté vigente (ej. lavado ilimitado mensual).",
  stamps: "Cada atención suma un sello; al completar la tarjeta, el cliente gana el premio."
};

export const CUSTOMER_PLAN_STATUS_LABEL: Record<CustomerPlan["status"], string> = {
  active: "Activo",
  exhausted: "Agotado",
  reward_ready: "Premio listo",
  redeemed: "Premio canjeado",
  expired: "Vencido",
  cancelled: "Cancelado"
};

/** Fecha (YYYY-MM-DD) de vencimiento: `validityDays` días contando el de inicio. */
export function computeExpiry(startsOn: string, validityDays: number | null): string | null {
  if (!validityDays) return null;
  const d = new Date(`${startsOn}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + validityDays - 1);
  return d.toISOString().slice(0, 10);
}

/** Fila de customer_plans a partir del plan del catálogo (copia: si el catálogo cambia, lo vendido no). */
export function customerPlanFromCatalog(plan: PackagePlan, organizationId: string, customerId: string, startsOn: string) {
  return {
    organization_id: organizationId,
    customer_id: customerId,
    plan_id: plan.id,
    name: plan.name,
    kind: plan.kind,
    sessions_total: plan.kind === "membership" ? null : plan.sessions_total,
    service_ids: plan.service_ids,
    reward_text: plan.reward_text,
    starts_on: startsOn,
    expires_on: computeExpiry(startsOn, plan.validity_days)
  };
}

/** Texto corto del saldo: "Quedan 3 de 5", "4 de 10 sellos", "Ilimitado hasta 2026-10-31". */
export function planBalanceText(plan: Pick<CustomerPlan, "kind" | "sessions_total" | "sessions_used" | "expires_on">): string {
  if (plan.kind === "membership") return plan.expires_on ? `Ilimitado hasta ${plan.expires_on}` : "Ilimitado";
  const total = plan.sessions_total ?? 0;
  if (plan.kind === "stamps") return `${plan.sessions_used} de ${total} sellos`;
  return `Quedan ${Math.max(0, total - plan.sessions_used)} de ${total}`;
}

/** 0..1 para la barra de progreso (membresía: sin barra). */
export function planProgress(plan: Pick<CustomerPlan, "kind" | "sessions_total" | "sessions_used">): number | null {
  if (plan.kind === "membership" || !plan.sessions_total) return null;
  return Math.min(1, plan.sessions_used / plan.sessions_total);
}

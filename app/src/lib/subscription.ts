import type { Organization } from "@/types/domain";

/** Días antes del vencimiento en que se avisa que hay que pagar. */
export const RENEWAL_NOTICE_DAYS = 5;

export type SubscriptionState =
  | { kind: "trial"; daysLeft: number; endsAt: Date }
  | { kind: "expiring"; daysLeft: number; endsAt: Date }
  | { kind: "ok" };

const DAY_MS = 86_400_000;

/**
 * Estado de la suscripción para avisarle al negocio. "trial": está en la
 * prueba gratis (el vencimiento todavía no pasó del fin de la prueba, o sea
 * no hay pagos confirmados). "expiring": pagó, pero vence pronto.
 */
export function subscriptionState(org: Pick<Organization, "subscription_expires_at" | "trial_ends_at">, now = new Date()): SubscriptionState {
  if (!org.subscription_expires_at) return { kind: "ok" };
  const endsAt = new Date(org.subscription_expires_at);
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
  const onTrial = !!org.trial_ends_at && endsAt.getTime() <= new Date(org.trial_ends_at).getTime();
  if (onTrial) return { kind: "trial", daysLeft, endsAt };
  if (daysLeft <= RENEWAL_NOTICE_DAYS) return { kind: "expiring", daysLeft, endsAt };
  return { kind: "ok" };
}

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "vence hoy";
  return daysLeft === 1 ? "te queda 1 día" : `te quedan ${daysLeft} días`;
}

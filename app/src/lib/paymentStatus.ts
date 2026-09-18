import type { PaymentStatus } from "@/types/domain";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  not_required: "Sin anticipo",
  awaiting_payment: "Esperando pago",
  awaiting_confirmation: "Comprobante recibido",
  paid: "Pago confirmado"
};

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, "default" | "success" | "warning" | "destructive" | "muted"> = {
  not_required: "muted",
  awaiting_payment: "warning",
  awaiting_confirmation: "warning",
  paid: "success"
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABEL[status as PaymentStatus] ?? status;
}

export function paymentStatusVariant(status: string): "default" | "success" | "warning" | "destructive" | "muted" {
  return PAYMENT_STATUS_VARIANT[status as PaymentStatus] ?? "muted";
}

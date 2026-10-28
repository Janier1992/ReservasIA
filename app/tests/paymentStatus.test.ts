import { describe, expect, it } from "vitest";
import { PAYMENT_STATUS_LABEL, paymentStatusLabel, paymentStatusVariant } from "@/lib/paymentStatus";
import type { PaymentStatus } from "@/types/domain";

const ALL_STATUSES: PaymentStatus[] = ["not_required", "awaiting_payment", "awaiting_confirmation", "paid"];

describe("paymentStatusLabel", () => {
  it("traduce cada estado conocido a una etiqueta en español", () => {
    for (const status of ALL_STATUSES) {
      expect(paymentStatusLabel(status)).toBe(PAYMENT_STATUS_LABEL[status]);
    }
  });

  it("usa el valor tal cual para un estado desconocido en vez de fallar", () => {
    expect(paymentStatusLabel("some_future_status")).toBe("some_future_status");
  });
});

describe("paymentStatusVariant", () => {
  it("le da a cada estado conocido un estilo de etiqueta", () => {
    for (const status of ALL_STATUSES) {
      expect(typeof paymentStatusVariant(status)).toBe("string");
    }
  });

  it("usa el estilo apagado para un estado desconocido", () => {
    expect(paymentStatusVariant("some_future_status")).toBe("muted");
  });
});

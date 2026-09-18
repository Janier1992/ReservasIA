import { describe, expect, it } from "vitest";
import { PAYMENT_STATUS_LABEL, paymentStatusLabel, paymentStatusVariant } from "@/lib/paymentStatus";
import type { PaymentStatus } from "@/types/domain";

const ALL_STATUSES: PaymentStatus[] = ["not_required", "awaiting_payment", "awaiting_confirmation", "paid"];

describe("paymentStatusLabel", () => {
  it("translates every known status to a Spanish label", () => {
    for (const status of ALL_STATUSES) {
      expect(paymentStatusLabel(status)).toBe(PAYMENT_STATUS_LABEL[status]);
    }
  });

  it("falls back to the raw value for an unknown status instead of throwing", () => {
    expect(paymentStatusLabel("some_future_status")).toBe("some_future_status");
  });
});

describe("paymentStatusVariant", () => {
  it("gives every known status a badge variant", () => {
    for (const status of ALL_STATUSES) {
      expect(typeof paymentStatusVariant(status)).toBe("string");
    }
  });

  it("falls back to muted for an unknown status", () => {
    expect(paymentStatusVariant("some_future_status")).toBe("muted");
  });
});

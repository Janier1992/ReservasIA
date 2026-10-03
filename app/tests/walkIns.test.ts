import { describe, expect, it } from "vitest";
import { boardDensity, cardSizeFor, formatTicket, formatWait, minutesBetween, notifyStatus, serviceProgress, walkInAssetLabel, walkInErrorMessage, walkInStats } from "@/lib/walkIns";
import type { WalkIn } from "@/types/domain";

function walkIn(partial: Partial<WalkIn>): WalkIn {
  return {
    id: "w",
    organization_id: "org",
    customer_id: null,
    customer_name: "Ana",
    customer_phone: null,
    service_id: null,
    notes: null,
    status: "waiting",
    reservation_id: null,
    arrived_at: "2026-09-26T10:00:00Z",
    served_at: null,
    finished_at: null,
    party_size: null,
    source: "staff",
    notify_channel: null,
    notify_identity: null,
    ready_at: null,
    notified_at: null,
    notify_error: null,
    order_items: null,
    ...partial
  };
}

describe("walk-in helpers", () => {
  it("formats waiting time for the queue", () => {
    expect(formatWait(0)).toBe("recién llegó");
    expect(formatWait(25)).toBe("25 min");
    expect(formatWait(60)).toBe("1 h");
    expect(formatWait(95)).toBe("1 h 35 min");
  });

  it("never reports a negative wait when clocks disagree", () => {
    expect(minutesBetween("2026-09-26T10:05:00Z", "2026-09-26T10:00:00Z")).toBe(0);
  });

  it("summarizes the day and averages the wait of served arrivals only", () => {
    const stats = walkInStats([
      walkIn({ status: "waiting" }),
      walkIn({ status: "in_service", served_at: "2026-09-26T10:10:00Z" }),
      walkIn({ status: "done", served_at: "2026-09-26T10:20:00Z" }),
      walkIn({ status: "left" })
    ]);
    expect(stats).toEqual({ waiting: 1, inService: 1, done: 1, left: 1, averageWaitMinutes: 15 });
  });

  it("has no average wait before anyone was served", () => {
    expect(walkInStats([walkIn({})]).averageWaitMinutes).toBeNull();
  });

  it("translates database error codes for the team", () => {
    expect(walkInErrorMessage({ message: "RESERVATION_NOT_AVAILABLE" })).toContain("ocupado");
    expect(walkInErrorMessage(new Error("WALK_IN_NOT_WAITING"))).toContain("ya fue atendida");
    expect(walkInErrorMessage({ message: "network down" })).toBe("network down");
    expect(walkInErrorMessage({ message: "FORBIDDEN" })).toContain("administrador");
  });

  it("describes the ready notification at each step", () => {
    expect(notifyStatus(walkIn({}))).toBeNull();
    expect(notifyStatus(walkIn({ source: "qr" }))?.label).toBe("Sin aviso");
    expect(notifyStatus(walkIn({ notify_channel: "telegram" }))?.label).toBe("Aviso por Telegram");
    const ready = { ready_at: "2026-09-26T10:30:00Z" };
    expect(notifyStatus(walkIn({ ...ready, notify_channel: "telegram" }))?.label).toBe("Avisando…");
    expect(notifyStatus(walkIn({ ...ready, notify_channel: "whatsapp", notified_at: "2026-09-26T10:30:05Z" }))?.label).toBe("Avisado por WhatsApp");
    expect(notifyStatus(walkIn({ ...ready, notify_channel: "telegram", notify_error: "blocked" }))?.variant).toBe("destructive");
    expect(notifyStatus(walkIn(ready))?.label).toBe("Listo · llamalo en persona");
  });
});

describe("serviceProgress", () => {
  const now = new Date("2026-09-26T10:30:00Z");

  it("compares the time in service with the service duration", () => {
    const p = serviceProgress(walkIn({ served_at: "2026-09-26T10:16:00Z", services: { name: "Lavado", duration_minutes: 20, price: null, currency: "COP" } }), now);
    expect(p).toEqual({ elapsed: 14, expected: 20, remaining: 6, ratio: 0.7, overdue: false });
  });

  it("flags attentions that ran over", () => {
    const p = serviceProgress(walkIn({ served_at: "2026-09-26T10:05:00Z", services: { name: "Lavado", duration_minutes: 20, price: null, currency: "COP" } }), now);
    expect(p).toMatchObject({ elapsed: 25, remaining: -5, ratio: 1, overdue: true });
  });

  it("uses the reservation length when there is no service", () => {
    const p = serviceProgress(
      walkIn({
        served_at: "2026-09-26T10:20:00Z",
        reservations: { resource_id: null, start_at: "2026-09-26T10:00:00Z", end_at: "2026-09-26T10:45:00Z", source: "public_page", resources: null }
      }),
      now
    );
    expect(p).toMatchObject({ elapsed: 10, expected: 45, remaining: 35 });
  });

  it("only reports elapsed time when the duration is unknown", () => {
    expect(serviceProgress(walkIn({ served_at: "2026-09-26T10:20:00Z" }), now)).toEqual({ elapsed: 10, expected: null, remaining: null, ratio: null, overdue: false });
  });

  it("titles the card with the plate or pet of the reservation", () => {
    const reservations = { resource_id: null, start_at: "2026-09-26T10:00:00Z", source: "chat", resources: null };
    expect(walkInAssetLabel(walkIn({ reservations: { ...reservations, customer_assets: { label: "GHT331", asset_type: "vehicle" } } }))).toBe("GHT331");
    expect(walkInAssetLabel(walkIn({ reservations }))).toBeNull();
  });
});

describe("formatTicket", () => {
  it("pads the daily ticket number", () => {
    expect(formatTicket(7)).toBe("#007");
    expect(formatTicket(1234)).toBe("#1234");
    expect(formatTicket(null)).toBe("");
  });
});

describe("board density", () => {
  it("shrinks the cards as more attentions arrive", () => {
    expect(boardDensity(0)).toBe("comfortable");
    expect(boardDensity(6)).toBe("comfortable");
    expect(boardDensity(7)).toBe("compact");
    expect(boardDensity(12)).toBe("compact");
    expect(boardDensity(13)).toBe("dense");
  });

  it("starts one size bigger on the display screen", () => {
    expect(cardSizeFor("comfortable", true)).toBe("lg");
    expect(cardSizeFor("comfortable", false)).toBe("md");
    expect(cardSizeFor("dense", true)).toBe("sm");
    expect(cardSizeFor("dense", false)).toBe("xs");
  });
});

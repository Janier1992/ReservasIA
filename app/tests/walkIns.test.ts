import { describe, expect, it } from "vitest";
import { formatWait, minutesBetween, walkInErrorMessage, walkInStats } from "@/lib/walkIns";
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
  });
});

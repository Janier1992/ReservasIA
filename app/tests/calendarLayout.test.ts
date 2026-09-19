import { describe, expect, it } from "vitest";
import { layoutOverlapping } from "@/lib/calendarLayout";

function item(id: string, start_at: string, end_at: string) {
  return { id, start_at, end_at };
}

describe("layoutOverlapping", () => {
  it("puts non-overlapping items all in lane 0", () => {
    const items = [item("a", "2026-09-15T09:00:00Z", "2026-09-15T09:30:00Z"), item("b", "2026-09-15T10:00:00Z", "2026-09-15T10:30:00Z")];
    const result = layoutOverlapping(items);
    expect(result.every((r) => r.lane === 0)).toBe(true);
    expect(result[0].lanes).toBe(1);
  });

  it("moves an overlapping item to a second lane", () => {
    const items = [item("a", "2026-09-15T09:00:00Z", "2026-09-15T10:00:00Z"), item("b", "2026-09-15T09:30:00Z", "2026-09-15T10:30:00Z")];
    const result = layoutOverlapping(items);
    const a = result.find((r) => r.item.id === "a")!;
    const b = result.find((r) => r.item.id === "b")!;
    expect(a.lane).not.toBe(b.lane);
    expect(a.lanes).toBe(2);
    expect(b.lanes).toBe(2);
  });

  it("reuses a lane once its previous item has ended", () => {
    const items = [
      item("a", "2026-09-15T09:00:00Z", "2026-09-15T09:30:00Z"),
      item("b", "2026-09-15T09:00:00Z", "2026-09-15T09:30:00Z"), // overlaps a -> lane 1
      item("c", "2026-09-15T09:30:00Z", "2026-09-15T10:00:00Z") // starts exactly when a ends -> reuses lane 0
    ];
    const result = layoutOverlapping(items);
    const a = result.find((r) => r.item.id === "a")!;
    const c = result.find((r) => r.item.id === "c")!;
    expect(c.lane).toBe(a.lane);
    expect(result.every((r) => r.lanes === 2)).toBe(true);
  });

  it("returns lanes: 1 for an empty list without dividing by zero", () => {
    expect(layoutOverlapping([])).toEqual([]);
  });

  it("does not mutate the input array order", () => {
    const items = [item("b", "2026-09-15T10:00:00Z", "2026-09-15T10:30:00Z"), item("a", "2026-09-15T09:00:00Z", "2026-09-15T09:30:00Z")];
    layoutOverlapping(items);
    expect(items[0].id).toBe("b");
  });
});

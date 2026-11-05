import { describe, expect, it } from "vitest";
import { parseQuantity, salesByProduct } from "@/lib/payments";

describe("ventas", () => {
  it("acepta cantidades enteras de 1 a 999", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity(" 10 ")).toBe(10);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("1.5")).toBeNull();
    expect(parseQuantity("1000")).toBeNull();
    expect(parseQuantity("")).toBeNull();
  });

  it("agrupa las ventas por producto, o por concepto si no lo hay, de la más vendida a la menos", () => {
    const rows = salesByProduct([
      { service_id: "burger", quantity: 2, amount: 36000, currency: "COP", concept: "Hamburguesa", services: { name: "Hamburguesa" } },
      { service_id: "soda", quantity: 1, amount: 4000, currency: "COP", concept: null, services: { name: "Gaseosa" } },
      { service_id: "burger", quantity: 1, amount: 18000, currency: "COP", concept: "Hamburguesa", services: { name: "Hamburguesa" } },
      { service_id: null, quantity: 1, amount: 2000, currency: "COP", concept: "Propina", services: null },
      { service_id: null, quantity: 1, amount: 1000, currency: "COP", concept: " propina ", services: null }
    ]);
    expect(rows.map((r) => [r.name, r.quantity, r.totals.COP])).toEqual([
      ["Hamburguesa", 3, 54000],
      ["Propina", 2, 3000],
      ["Gaseosa", 1, 4000]
    ]);
  });
});

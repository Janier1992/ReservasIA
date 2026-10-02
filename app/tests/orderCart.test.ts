import { describe, expect, it } from "vitest";
import { cartCount, cartLines, cartTotal, MAX_ITEM_QUANTITY, MAX_ORDER_LINES, orderItemsForSale, setCartQuantity, summarizeOrderItems } from "@/lib/orderCart";

const burger = { id: "a", name: "Hamburguesa", price: 18000, currency: "COP" };
const lemonade = { id: "b", name: "Limonada", price: 6000, currency: "COP" };
const water = { id: "c", name: "Agua", price: null, currency: "COP" };

describe("setCartQuantity", () => {
  it("adds, changes and removes products", () => {
    let cart = setCartQuantity({}, "a", 1);
    cart = setCartQuantity(cart, "b", 2);
    cart = setCartQuantity(cart, "a", 3);
    expect(cart).toEqual({ a: 3, b: 2 });
    expect(setCartQuantity(cart, "a", 0)).toEqual({ b: 2 });
  });

  it("caps the quantity and the number of different products", () => {
    expect(setCartQuantity({}, "a", 99)).toEqual({ a: MAX_ITEM_QUANTITY });
    const full = Object.fromEntries(Array.from({ length: MAX_ORDER_LINES }, (_, i) => [`p${i}`, 1]));
    expect(setCartQuantity(full, "extra", 1)).toBe(full);
    expect(setCartQuantity(full, "p0", 2).p0).toBe(2);
  });
});

describe("cart lines and total", () => {
  it("lists products in menu order with subtotals", () => {
    const lines = cartLines({ b: 1, a: 2, gone: 4 }, [burger, lemonade]);
    expect(lines.map((l) => [l.product.name, l.quantity, l.subtotal])).toEqual([
      ["Hamburguesa", 2, 36000],
      ["Limonada", 1, 6000]
    ]);
    expect(cartCount(lines)).toBe(3);
    expect(cartTotal(lines)).toEqual({ total: 42000, currency: "COP" });
  });

  it("has no total when a product has no price or currencies differ", () => {
    expect(cartTotal(cartLines({ a: 1, c: 1 }, [burger, water]))).toBeNull();
    expect(cartTotal(cartLines({ a: 1, b: 1 }, [burger, { ...lemonade, currency: "USD" }]))).toBeNull();
    expect(cartTotal([])).toBeNull();
  });
});

describe("order summaries", () => {
  it("reads like a sentence", () => {
    expect(summarizeOrderItems(null)).toBe("");
    expect(summarizeOrderItems([{ name: "Limonada", quantity: 1 }])).toBe("Limonada");
    expect(
      summarizeOrderItems([
        { name: "Hamburguesa", quantity: 2 },
        { name: "Papas", quantity: 1 },
        { name: "Limonada", quantity: 3 }
      ])
    ).toBe("2× Hamburguesa, Papas y 3× Limonada");
  });

  it("offers per-product sales only when every product has a price", () => {
    const item = { service_id: "a", name: "Hamburguesa", quantity: 2, unit_price: 18000, currency: "COP" };
    expect(orderItemsForSale([item])).toEqual([item]);
    expect(orderItemsForSale([item, { ...item, service_id: "c", unit_price: null }])).toBeNull();
    expect(orderItemsForSale([item, { ...item, service_id: "c", unit_price: 0 }])).toBeNull();
    expect(orderItemsForSale(null)).toBeNull();
  });
});

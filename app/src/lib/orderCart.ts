import type { OrderItem } from "@/types/domain";

/** Límites del pedido por QR; los mismos que valida el server (MAX_ORDER_LINES / MAX_ITEM_QUANTITY). */
export const MAX_ORDER_LINES = 20;
export const MAX_ITEM_QUANTITY = 20;

/** Carrito del pedido por QR: id del producto → cantidad. */
export type Cart = Record<string, number>;

interface CartProduct {
  id: string;
  name: string;
  price: number | null;
  currency: string;
}

/** Cambia la cantidad de un producto; 0 lo saca del carrito. Respeta los límites. */
export function setCartQuantity(cart: Cart, productId: string, quantity: number): Cart {
  const clamped = Math.min(MAX_ITEM_QUANTITY, Math.max(0, Math.floor(quantity)));
  const next = { ...cart };
  if (clamped === 0) {
    delete next[productId];
    return next;
  }
  // Un producto nuevo no entra si ya hay tantas líneas como permite el server.
  if (!(productId in next) && Object.keys(next).length >= MAX_ORDER_LINES) return cart;
  next[productId] = clamped;
  return next;
}

export interface CartLine {
  product: CartProduct;
  quantity: number;
  subtotal: number | null;
}

/** Líneas del carrito en el orden de la carta, ignorando productos que ya no están. */
export function cartLines(cart: Cart, products: CartProduct[]): CartLine[] {
  return products
    .filter((p) => (cart[p.id] ?? 0) > 0)
    .map((p) => ({ product: p, quantity: cart[p.id], subtotal: p.price === null ? null : p.price * cart[p.id] }));
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/** Total del carrito; null si algún producto no tiene precio o hay monedas distintas. */
export function cartTotal(lines: CartLine[]): { total: number; currency: string } | null {
  if (lines.length === 0 || lines.some((l) => l.subtotal === null)) return null;
  if (new Set(lines.map((l) => l.product.currency)).size !== 1) return null;
  return { total: lines.reduce((sum, l) => sum + (l.subtotal ?? 0), 0), currency: lines[0].product.currency };
}

/** "2× Hamburguesa, Papas y Limonada": así se lee el pedido en la fila y en los avisos. */
export function summarizeOrderItems(items: Pick<OrderItem, "name" | "quantity">[] | null | undefined): string {
  const parts = (items ?? []).map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name));
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * Productos del pedido listos para registrar como ventas (una por producto).
 * null si alguno no tiene precio (o es gratis): ahí se registra un monto a mano.
 */
export function orderItemsForSale(items: OrderItem[] | null | undefined): OrderItem[] | null {
  if (!items || items.length === 0 || items.some((i) => i.unit_price === null || i.unit_price <= 0)) return null;
  return items;
}

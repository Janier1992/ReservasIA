import { useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, MessageCircle, Minus, Plus, Send, ShoppingBag, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatTicket } from "@/lib/walkIns";
import { cartCount, cartLines, cartTotal, MAX_ITEM_QUANTITY, setCartQuantity, type Cart } from "@/lib/orderCart";
import { PublicApiError, publicApi, type PublicBusiness, type PublicOrder } from "@/lib/publicApi";
import { PublicBusinessHeader } from "./PublicBusinessHeader";

interface Props {
  slug: string;
  business: PublicBusiness;
  icon: LucideIcon;
}

function QuantityStepper({ name, quantity, onChange }: { name: string; quantity: number; onChange: (quantity: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Cantidad de ${name}`}>
      <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-full" aria-label={`Quitar uno: ${name}`} onClick={() => onChange(quantity - 1)}>
        {quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </Button>
      <span className="w-7 text-center font-semibold tabular-nums">{quantity}</span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-9 w-9 rounded-full"
        aria-label={`Sumar uno: ${name}`}
        disabled={quantity >= MAX_ITEM_QUANTITY}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Pedido inmediato desde el QR del local: armar el pedido con uno o varios
 * productos (con su cantidad), dejar el nombre y entrar a la fila. Después se
 * ofrece el aviso de "listo" por los canales que el negocio tenga conectados
 * (el primer mensaje del cliente vincula su chat).
 */
export function PublicOrderView({ slug, business, icon }: Props) {
  const [cart, setCart] = useState<Cart>({});
  const [form, setForm] = useState({ name: "", phone: "", notes: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const lines = useMemo(() => cartLines(cart, business.services), [cart, business.services]);
  const count = cartCount(lines);
  const total = cartTotal(lines);
  const change = (productId: string, quantity: number) => setCart((current) => setCartQuantity(current, productId, quantity));
  const productsLabel = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      setOrder(
        await publicApi.order(slug, {
          items: lines.map((l) => ({ serviceId: l.product.id, quantity: l.quantity })),
          name: form.name,
          phone: form.phone || undefined,
          notes: form.notes || undefined,
          website: form.website || undefined
        })
      );
    } catch (err) {
      setError(err instanceof PublicApiError ? err.message : "No se pudo enviar el pedido. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (order) {
    const hasChannels = order.telegramUrl || order.whatsappUrl;
    const items = order.items ?? [];
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl font-semibold">¡Pedido recibido, {form.name.split(" ")[0]}!</h1>
        {order.ticketNumber ? (
          <div className="rounded-2xl border-2 border-primary/50 bg-card px-6 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tu ticket</p>
            <p className="font-mono text-4xl font-bold tracking-widest">{formatTicket(order.ticketNumber)}</p>
          </div>
        ) : null}
        <p className="text-muted-foreground">
          {items.length > 0 ? (
            "Tu pedido"
          ) : (
            <>
              Tu <strong className="text-foreground">{order.serviceName}</strong>
            </>
          )}{" "}
          está en preparación en {business.name}. Hay <strong className="text-foreground">{order.position}</strong>{" "}
          {order.position === 1 ? "pedido" : "pedidos"} en la fila contando el tuyo. Mostrá tu ticket al reclamarlo.
        </p>
        {items.length > 0 && (
          <div className="w-full rounded-2xl border border-border bg-card p-4 text-left">
            <ul className="divide-y divide-border text-sm">
              {items.map((item) => (
                <li key={item.name} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-8 shrink-0 font-semibold tabular-nums">{item.quantity}×</span>
                  <span className="flex-1">{item.name}</span>
                </li>
              ))}
            </ul>
            {order.total != null && (
              <p className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(order.total, order.currency ?? null)}</span>
              </p>
            )}
          </div>
        )}
        {hasChannels ? (
          <div className="w-full space-y-3 rounded-2xl border border-border bg-card p-5">
            <p className="font-medium">¿Te avisamos cuando esté listo?</p>
            <p className="text-sm text-muted-foreground">Tocá tu app y enviá el mensaje que aparece: te escribimos apenas puedas reclamarlo.</p>
            {order.telegramUrl && (
              <a href={order.telegramUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                <Send className="h-4 w-4" /> Avisame por Telegram
              </a>
            )}
            {order.whatsappUrl && (
              <a
                href={order.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "lg", variant: order.telegramUrl ? "outline" : "default" }), "w-full")}
              >
                <MessageCircle className="h-4 w-4" /> Avisame por WhatsApp
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Te llamamos por tu nombre cuando esté listo.</p>
        )}
        <p className="text-xs text-muted-foreground">Código de pedido: {order.code}</p>
      </main>
    );
  }

  return (
    <main className={cn("mx-auto max-w-2xl px-4 pt-10 sm:pt-16", count > 0 ? "pb-32" : "pb-16")}>
      <PublicBusinessHeader business={business} icon={icon} />
      <div className="space-y-10">
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold">¿Qué vas a pedir?</h2>
            {business.services.length > 0 && <p className="text-sm text-muted-foreground">Elegí uno o varios productos y la cantidad de cada uno.</p>}
          </div>
          {business.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este negocio todavía no publicó su menú.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {business.services.map((s) => {
                const quantity = cart[s.id] ?? 0;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors",
                      quantity > 0 ? "border-primary ring-2 ring-primary/20" : "border-border"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.name}</p>
                      {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                      {s.price !== null && <p className="text-sm font-medium">{formatCurrency(s.price, s.currency)}</p>}
                    </div>
                    {quantity > 0 ? (
                      <QuantityStepper name={s.name} quantity={quantity} onChange={(q) => change(s.id, q)} />
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-full" aria-label={`Agregar ${s.name}`} onClick={() => change(s.id, 1)}>
                        <Plus className="h-4 w-4" /> Agregar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {lines.length > 0 && (
          <form ref={formRef} onSubmit={submit} className="scroll-mt-6 space-y-5 rounded-2xl border border-border bg-card p-5">
            <div className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Tu pedido</h2>
              <ul className="divide-y divide-border">
                {lines.map((l) => (
                  <li key={l.product.id} className="flex items-center gap-3 py-2 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.product.name}</p>
                      {l.subtotal !== null && <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(l.subtotal, l.product.currency)}</p>}
                    </div>
                    <QuantityStepper name={l.product.name} quantity={l.quantity} onChange={(q) => change(l.product.id, q)} />
                  </li>
                ))}
              </ul>
              {total && (
                <p className="flex justify-between border-t border-border pt-3 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(total.total, total.currency)}</span>
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="po-name">Tu nombre *</Label>
                <Input id="po-name" autoComplete="given-name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-phone">Celular (opcional)</Label>
                <Input id="po-phone" type="tel" autoComplete="tel" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="po-notes">Indicaciones (opcional)</Label>
                <Input
                  id="po-notes"
                  maxLength={300}
                  placeholder="Ej: hamburguesa sin cebolla, salsas aparte"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              {/* Campo trampa para bots: fuera de pantalla y fuera del orden de tabulación. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="po-website">Sitio web</label>
                <input id="po-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Enviando..." : `Hacer pedido · ${productsLabel(count)}`}
            </Button>
          </form>
        )}
      </div>
      <footer className="mt-16 text-center text-xs text-muted-foreground">Pedidos con ReservasIA</footer>

      {/* Barra fija abajo: el pedido se ve siempre mientras se recorre la carta. */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <ShoppingBag className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{productsLabel(count)}</span>
              {total && <span className="text-muted-foreground"> · {formatCurrency(total.total, total.currency)}</span>}
            </p>
            <Button type="button" onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Ver pedido
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

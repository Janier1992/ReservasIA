import { useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Check, ChevronDown, Minus, PencilLine, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatTicket } from "@/lib/walkIns";
import { WEEKDAY_NAMES, weekdayIn } from "@/lib/menuDays";
import { cartCount, cartLines, cartTotal, MAX_ITEM_QUANTITY, setCartQuantity, type Cart } from "@/lib/orderCart";
import { PublicApiError, publicApi, type PublicBusiness, type PublicOrder } from "@/lib/publicApi";
import { PublicBusinessHeader } from "./PublicBusinessHeader";
import { NotifyChannelsCard } from "./NotifyChannelsCard";

/** Lo que el cliente escribe porque no está en la carta (el negocio confirma el precio). */
interface CustomLine {
  id: number;
  name: string;
  /** Qué lleva el plato. */
  includes: string;
  /** Precio por unidad que indicó el cliente; null = lo confirma el negocio. */
  unitPrice: number | null;
  quantity: number;
}

const EMPTY_CUSTOM = { name: "", includes: "", price: "", quantity: 1 };

const MAX_CUSTOM_LINES = 5;
const MAX_CUSTOM_NAME = 80;

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
  // Para quién es cada porción, por producto (opcional).
  const [forNames, setForNames] = useState<Record<string, string[]>>({});
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(EMPTY_CUSTOM);
  const nextCustomId = useRef(1);
  const [form, setForm] = useState({ name: "", phone: "", notes: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const lines = useMemo(() => cartLines(cart, business.services), [cart, business.services]);
  const customCount = customLines.reduce((sum, c) => sum + c.quantity, 0);
  const count = cartCount(lines) + customCount;
  const hasOrder = lines.length > 0 || customLines.length > 0;
  // Moneda del negocio (la de su carta) para lo que el cliente escribe con precio.
  const currency = business.services[0]?.currency ?? "COP";
  const menuTotal = cartTotal(lines);
  // Total con lo de la carta y lo escrito a mano con precio; "parcial" si algo no tiene precio.
  const pricedSum =
    lines.reduce((sum, l) => sum + (l.subtotal ?? 0), 0) + customLines.reduce((sum, c) => sum + (c.unitPrice ?? 0) * c.quantity, 0);
  const anyPriced = lines.some((l) => l.subtotal !== null) || customLines.some((c) => c.unitPrice !== null);
  const totalComplete = lines.every((l) => l.subtotal !== null) && customLines.every((c) => c.unitPrice !== null);
  const total = anyPriced ? { total: pricedSum, currency: menuTotal?.currency ?? lines[0]?.product.currency ?? currency } : null;
  const totalLabel = totalComplete ? "Total" : "Total parcial";
  const change = (productId: string, quantity: number) => setCart((current) => setCartQuantity(current, productId, quantity));
  const productsLabel = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

  const draftPrice = customDraft.price.trim() === "" ? null : Number(customDraft.price);
  const draftValid = customDraft.name.trim().length >= 2 && (draftPrice === null || (Number.isFinite(draftPrice) && draftPrice >= 0));

  function addCustom() {
    const name = customDraft.name.trim().replace(/\s+/g, " ");
    if (!draftValid || customLines.length >= MAX_CUSTOM_LINES) return;
    setCustomLines((current) => [
      ...current,
      {
        id: nextCustomId.current++,
        name: name.slice(0, MAX_CUSTOM_NAME),
        includes: customDraft.includes.trim().slice(0, 300),
        unitPrice: draftPrice === null ? null : Math.round(draftPrice),
        quantity: Math.min(Math.max(1, customDraft.quantity), MAX_ITEM_QUANTITY)
      }
    ]);
    setCustomDraft(EMPTY_CUSTOM);
    setCustomOpen(false);
  }

  function changeCustom(id: number, quantity: number) {
    setCustomLines((current) =>
      quantity <= 0 ? current.filter((c) => c.id !== id) : current.map((c) => (c.id === id ? { ...c, quantity: Math.min(quantity, MAX_ITEM_QUANTITY) } : c))
    );
  }

  /** Volver a la carta para otro pedido, sin recargar la página (se conservan nombre y celular). */
  function startOver() {
    setOrder(null);
    setCart({});
    setForNames({});
    setCustomLines([]);
    setCustomDraft(EMPTY_CUSTOM);
    setCustomOpen(false);
    setError(null);
    setForm((f) => ({ ...f, notes: "" }));
    window.scrollTo({ top: 0 });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasOrder) return;
    setSubmitting(true);
    setError(null);
    try {
      setOrder(
        await publicApi.order(slug, {
          items: lines.map((l) => {
            const names = (forNames[l.product.id] ?? []).slice(0, l.quantity).map((n) => n.trim()).filter(Boolean);
            return names.length > 0 ? { serviceId: l.product.id, quantity: l.quantity, forNames: names } : { serviceId: l.product.id, quantity: l.quantity };
          }),
          customItems:
            customLines.length > 0
              ? customLines.map((c) => ({
                  name: c.name,
                  quantity: c.quantity,
                  ...(c.includes ? { includes: c.includes } : {}),
                  ...(c.unitPrice !== null ? { unitPrice: c.unitPrice } : {})
                }))
              : undefined,
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
              {items.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-8 shrink-0 font-semibold tabular-nums">{item.quantity}×</span>
                  <span className="flex-1">
                    {item.name}
                    {item.forNames && item.forNames.length > 0 && <span className="block text-xs text-muted-foreground">Para: {item.forNames.join(", ")}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {order.total == null && customLines.some((c) => c.unitPrice === null) && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                El precio de lo que escribiste fuera de la carta te lo confirman en {business.name}.
              </p>
            )}
            {order.total != null && (
              <p className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(order.total, order.currency ?? null)}</span>
              </p>
            )}
          </div>
        )}
        {hasChannels ? (
          <NotifyChannelsCard
            telegramUrl={order.telegramUrl}
            whatsappUrl={order.whatsappUrl}
            title="¿Te avisamos cuando esté listo?"
            description="Tocá tu app y enviá el mensaje que aparece: te escribimos apenas puedas reclamarlo."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Te llamamos por tu nombre cuando esté listo.</p>
        )}
        <Button type="button" variant="outline" onClick={startOver}>
          <ArrowLeft className="h-4 w-4" /> Volver a la carta
        </Button>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Menú de hoy · {WEEKDAY_NAMES[weekdayIn(business.timezone)]}</p>
            <h2 className="font-display text-lg font-semibold">¿Qué vas a pedir?</h2>
            {business.services.length > 0 && <p className="text-sm text-muted-foreground">Elegí uno o varios productos y la cantidad de cada uno.</p>}
          </div>
          {business.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hoy no hay productos en el menú. Preguntá en el mostrador.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Lo agotado hoy va al final: se ve, pero no se puede pedir. */}
              {[...business.services].sort((a, b) => Number(!!a.soldOut) - Number(!!b.soldOut)).map((s) => {
                const quantity = cart[s.id] ?? 0;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors",
                      quantity > 0 ? "border-primary ring-2 ring-primary/20" : "border-border",
                      s.soldOut && "bg-muted/40 opacity-70"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.name}</p>
                      {s.description && <p className="text-sm text-muted-foreground">Incluye: {s.description}</p>}
                      {s.price !== null && <p className="text-sm font-medium">{formatCurrency(s.price, s.currency)}</p>}
                    </div>
                    {s.soldOut ? (
                      <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agotado hoy</span>
                    ) : quantity > 0 ? (
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

        {/* Lo que no está en la carta: el cliente lo describe (y, si lo sabe, el precio). */}
        <section className="rounded-2xl border border-dashed border-border bg-card/60" aria-labelledby="po-custom-title">
          <button
            type="button"
            className="flex w-full items-start gap-3 p-4 text-left"
            aria-expanded={customOpen}
            aria-controls="po-custom-form"
            onClick={() => setCustomOpen((open) => !open)}
          >
            <PencilLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span id="po-custom-title" className="block font-medium">
                ¿No encontrás lo que querés?
              </span>
              <span className="block text-sm text-muted-foreground">Agregá un plato que no está en la carta, con lo que lleva y su precio.</span>
            </span>
            <ChevronDown className={cn("mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform", customOpen && "rotate-180")} aria-hidden="true" />
          </button>
          {customOpen && (
            <div id="po-custom-form" className="space-y-3 border-t border-dashed border-border p-4">
              {customLines.length >= MAX_CUSTOM_LINES ? (
                <p className="text-sm text-muted-foreground">Podés agregar hasta {MAX_CUSTOM_LINES} platos fuera de la carta.</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="po-custom-name">Nombre del plato *</Label>
                    <Input
                      id="po-custom-name"
                      maxLength={MAX_CUSTOM_NAME}
                      placeholder="Ej: Bandeja especial"
                      value={customDraft.name}
                      onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="po-custom-includes">¿Qué lleva? (opcional)</Label>
                    <Input
                      id="po-custom-includes"
                      maxLength={300}
                      placeholder="Ej: arroz, frijoles, chicharrón y huevo"
                      value={customDraft.includes}
                      onChange={(e) => setCustomDraft({ ...customDraft, includes: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="po-custom-price">Precio ({currency}, opcional)</Label>
                      <Input
                        id="po-custom-price"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="Ej: 25000"
                        value={customDraft.price}
                        onChange={(e) => setCustomDraft({ ...customDraft, price: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="po-custom-qty">Cantidad</Label>
                      <Input
                        id="po-custom-qty"
                        type="number"
                        min={1}
                        max={MAX_ITEM_QUANTITY}
                        inputMode="numeric"
                        value={customDraft.quantity}
                        onChange={(e) => setCustomDraft({ ...customDraft, quantity: Number(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">El local confirma el precio al entregarte el pedido.</p>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={addCustom} disabled={!draftValid}>
                      <Plus className="h-4 w-4" /> Agregar al pedido
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {hasOrder && (
          <form ref={formRef} onSubmit={submit} className="scroll-mt-6 space-y-5 rounded-2xl border border-border bg-card p-5">
            <div className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Tu pedido</h2>
              <ul className="divide-y divide-border">
                {lines.map((l) => (
                  <li key={l.product.id} className="space-y-2 py-3 first:pt-0">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{l.product.name}</p>
                        {l.product.description && <p className="text-xs text-muted-foreground">Incluye: {l.product.description}</p>}
                        {l.subtotal !== null && <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(l.subtotal, l.product.currency)}</p>}
                      </div>
                      <QuantityStepper name={l.product.name} quantity={l.quantity} onChange={(q) => change(l.product.id, q)} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: l.quantity }, (_, i) => (
                        <Input
                          key={i}
                          maxLength={40}
                          className="h-9 text-sm"
                          aria-label={`Para quién es ${l.quantity > 1 ? `la porción ${i + 1} de ` : ""}${l.product.name}`}
                          placeholder={l.quantity > 1 ? `¿Para quién? (porción ${i + 1}, opcional)` : "¿Para quién es? (opcional)"}
                          value={forNames[l.product.id]?.[i] ?? ""}
                          onChange={(e) =>
                            setForNames((current) => {
                              const names = [...(current[l.product.id] ?? [])];
                              names[i] = e.target.value;
                              return { ...current, [l.product.id]: names };
                            })
                          }
                        />
                      ))}
                    </div>
                  </li>
                ))}
                {customLines.map((c) => (
                  <li key={`custom-${c.id}`} className="flex items-center gap-3 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.includes && <p className="text-xs text-muted-foreground">Incluye: {c.includes}</p>}
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {c.unitPrice !== null ? `${formatCurrency(c.unitPrice * c.quantity, currency)} · ` : ""}Fuera de la carta
                        {c.unitPrice === null ? " · precio por confirmar" : ""}
                      </p>
                    </div>
                    <QuantityStepper name={c.name} quantity={c.quantity} onChange={(q) => changeCustom(c.id, q)} />
                  </li>
                ))}
              </ul>
              {total && (
                <p className="flex justify-between border-t border-border pt-3 font-semibold">
                  <span>{totalLabel}</span>
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
              {total && totalComplete && <span className="text-muted-foreground"> · {formatCurrency(total.total, total.currency)}</span>}
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

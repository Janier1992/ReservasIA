import { useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Check, Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatTicket } from "@/lib/walkIns";
import { WEEKDAY_NAMES, weekdayIn } from "@/lib/menuDays";
import { cartCount, cartLines, cartTotal, MAX_ITEM_QUANTITY, setCartQuantity, type Cart } from "@/lib/orderCart";
import { PublicApiError, publicApi, type PublicBusiness, type PublicOrder } from "@/lib/publicApi";
import { PublicBusinessHeader } from "./PublicBusinessHeader";
import { NotifyChannelsCard } from "./NotifyChannelsCard";
import { PrivacyPolicyLink } from "./PrivacyPolicyLink";

/** Plato que no está en la carta: nombre, qué lleva y precio. */
const EMPTY_CUSTOM = { name: "", includes: "", price: "" };

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
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(EMPTY_CUSTOM);
  // Guardar el plato escrito a mano en la carta: solo si se marca.
  const [addToMenu, setAddToMenu] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const lines = useMemo(() => cartLines(cart, business.services), [cart, business.services]);
  const count = cartCount(lines);
  const hasOrder = lines.length > 0;
  // Moneda del negocio (la de su carta) para el plato escrito a mano.
  const currency = business.services[0]?.currency ?? "COP";
  const total = cartTotal(lines);
  const change = (productId: string, quantity: number) => setCart((current) => setCartQuantity(current, productId, quantity));
  const productsLabel = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

  // Nombre y precio del plato son obligatorios.
  const draftPrice = Number(customDraft.price.replace(/\D/g, ""));
  const draftValid = customDraft.name.trim().length >= 2 && Number.isFinite(draftPrice) && draftPrice > 0;
  // El plato escrito va en el pedido si está completo (desde su formulario o desde "Tu pedido").
  const draftInOrder = customOpen && draftValid;

  /** Volver a la carta para otro pedido, sin recargar la página (se conservan nombre y celular). */
  function startOver() {
    setOrder(null);
    setCart({});
    setForNames({});
    setCustomDraft(EMPTY_CUSTOM);
    setAddToMenu(false);
    setCustomOpen(false);
    setError(null);
    setForm((f) => ({ ...f, notes: "" }));
    window.scrollTo({ top: 0 });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasOrder && !draftInOrder) return;
    setSubmitting(true);
    setError(null);
    try {
      setOrder(
        await publicApi.order(slug, {
          items: lines.map((l) => {
            const names = (forNames[l.product.id] ?? []).slice(0, l.quantity).map((n) => n.trim()).filter(Boolean);
            return names.length > 0 ? { serviceId: l.product.id, quantity: l.quantity, forNames: names } : { serviceId: l.product.id, quantity: l.quantity };
          }),
          customItems: draftInOrder
            ? [
                {
                  name: customDraft.name.trim().replace(/\s+/g, " ").slice(0, MAX_CUSTOM_NAME),
                  quantity: 1,
                  ...(customDraft.includes.trim() ? { includes: customDraft.includes.trim().slice(0, 300) } : {}),
                  unitPrice: Math.round(draftPrice),
                  addToMenu
                }
              ]
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

        {/* Lo que no está en la carta: nombre, lo que lleva y precio; queda en la carta del local. */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <button
            type="button"
            className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/40"
            aria-expanded={customOpen}
            aria-controls="po-custom-form"
            onClick={() => setCustomOpen((open) => !open)}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">¿No está en la carta?</span>
              <span className="block text-sm text-muted-foreground">Agregá tu plato con lo que lleva y su precio.</span>
            </span>
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform",
                customOpen && "rotate-45 border-primary text-primary"
              )}
              aria-hidden="true"
            >
              <Plus className="h-4 w-4" />
            </span>
          </button>
          {customOpen && (
            <div id="po-custom-form" className="border-t border-border bg-muted/30 p-4 sm:p-5">
              <form className="space-y-3" onSubmit={submit}>
                <Input
                  aria-label="Nombre del plato"
                  className="h-12 bg-card text-base font-medium"
                  required
                  minLength={2}
                  maxLength={MAX_CUSTOM_NAME}
                  placeholder="Nombre del plato"
                  value={customDraft.name}
                  onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })}
                />
                <Textarea
                  aria-label="Qué lleva el plato"
                  className="min-h-20 resize-none bg-card text-sm"
                  maxLength={300}
                  placeholder="¿Qué lleva? Ej: arroz, frijoles, chicharrón y huevo"
                  value={customDraft.includes}
                  onChange={(e) => setCustomDraft({ ...customDraft, includes: e.target.value })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
                      $
                    </span>
                    <Input
                      aria-label={`Precio en ${currency}`}
                      className="h-12 bg-card pl-7 pr-14 text-base tabular-nums"
                      inputMode="numeric"
                      required
                      placeholder="Precio"
                      value={customDraft.price}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                        setCustomDraft({ ...customDraft, price: digits ? Number(digits).toLocaleString("es-CO") : "" });
                      }}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground" aria-hidden="true">
                      {currency}
                    </span>
                  </div>
                  <Input
                    aria-label="Quién recibe el pedido"
                    className="h-12 bg-card text-base"
                    autoComplete="given-name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="¿Quién recibe el pedido?"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
                    checked={addToMenu}
                    onChange={(e) => setAddToMenu(e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Agregar este plato al menú</span>
                    <span className="block text-xs text-muted-foreground">Queda guardado con su precio para los próximos pedidos.</span>
                  </span>
                </label>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" size="lg" className="h-12 w-full rounded-xl" disabled={!draftValid || form.name.trim().length < 2 || submitting}>
                  {submitting
                    ? "Enviando..."
                    : `Hacer pedido${draftValid && (!hasOrder || total) ? ` · ${formatCurrency(draftPrice + (total?.total ?? 0), total?.currency ?? currency)}` : ""}`}
                </Button>
                {hasOrder && <p className="text-center text-xs text-muted-foreground">Incluye también {productsLabel(count)} de la carta.</p>}
              </form>
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
            {error && !customOpen && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Enviando..." : `Hacer pedido · ${productsLabel(count + (draftInOrder ? 1 : 0))}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              Al hacer el pedido, {business.name} recibe tu nombre (y tu celular, si lo das) solo para preparar tu pedido y avisarte
              cuando esté listo. Más en la <PrivacyPolicyLink />.
            </p>
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

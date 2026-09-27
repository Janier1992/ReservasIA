import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, MessageCircle, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { PublicApiError, publicApi, type PublicBusiness, type PublicOrder, type PublicService } from "@/lib/publicApi";
import { PublicBusinessHeader } from "./PublicBusinessHeader";

interface Props {
  slug: string;
  business: PublicBusiness;
  icon: LucideIcon;
}

/**
 * Pedido inmediato desde el QR del local: elegir producto, dejar el nombre y
 * entrar a la fila. Después se ofrece el aviso de "listo" por los canales que
 * el negocio tenga conectados (el primer mensaje del cliente vincula su chat).
 */
export function PublicOrderView({ slug, business, icon }: Props) {
  const [service, setService] = useState<PublicService | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", notes: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service) return;
    setSubmitting(true);
    setError(null);
    try {
      setOrder(
        await publicApi.order(slug, {
          serviceId: service.id,
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
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl font-semibold">¡Pedido recibido, {form.name.split(" ")[0]}!</h1>
        <p className="text-muted-foreground">
          Tu <strong className="text-foreground">{order.serviceName}</strong> está en preparación en {business.name}. Sos el{" "}
          <strong className="text-foreground">#{order.position}</strong> en la fila.
        </p>
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
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:pt-16">
      <PublicBusinessHeader business={business} icon={icon} />
      <div className="space-y-10">
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">¿Qué vas a pedir?</h2>
          {business.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este negocio todavía no publicó su menú.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {business.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setService(s)}
                  aria-pressed={service?.id === s.id}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/60",
                    service?.id === s.id ? "border-primary ring-2 ring-primary/20" : "border-border"
                  )}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.description && <span className="text-sm text-muted-foreground">{s.description}</span>}
                  {s.price !== null && <span className="text-sm font-medium">{formatCurrency(s.price, s.currency)}</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        {service && (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Tu pedido: {service.name}</p>
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
                <Input id="po-notes" maxLength={300} placeholder="Ej: sin cebolla, 2 unidades" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
              {submitting ? "Enviando..." : "Hacer pedido"}
            </Button>
          </form>
        )}
      </div>
      <footer className="mt-16 text-center text-xs text-muted-foreground">Pedidos con ReservasIA</footer>
    </main>
  );
}

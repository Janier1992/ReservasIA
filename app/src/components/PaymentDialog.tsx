import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, formatCurrency } from "@/lib/currency";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, parseAmount, parseQuantity } from "@/lib/payments";
import type { OrderItem, PaymentMethod, Service } from "@/types/domain";

// Radix Select no admite un item con value "": este valor representa "sin producto".
const NONE = "none";

export interface PaymentDraft {
  amount?: number | null;
  currency?: string | null;
  concept?: string | null;
  serviceId?: string | null;
  reservationId?: string | null;
  customerId?: string | null;
  customerPlanId?: string | null;
  /** Pedido por QR con varios productos: se registra una venta por producto. */
  items?: OrderItem[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  draft: PaymentDraft;
  title?: string;
  onSaved?: () => void;
}

/**
 * Registrar una venta: el producto del catálogo llena el precio (× cantidad) y
 * el concepto; el monto se puede ajustar. Se usa desde Ventas, Atención en
 * sitio, Reservas y al vender un plan.
 */
export function PaymentDialog({ open, onOpenChange, organizationId, draft, title = "Registrar venta", onSaved }: Props) {
  const [serviceId, setServiceId] = useState(NONE);
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [concept, setConcept] = useState("");
  const [saving, setSaving] = useState(false);
  const [useItems, setUseItems] = useState(false);
  const orderItems = useItems && draft.items && draft.items.length > 0 ? draft.items : null;
  const itemsTotal = orderItems?.reduce((sum, i) => sum + (i.unit_price ?? 0) * i.quantity, 0) ?? 0;

  const { data: services = [] } = useQuery({
    queryKey: ["sale-services", organizationId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("services")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Service[];
    }
  });
  const product = services.find((s) => s.id === serviceId) ?? null;
  const qty = parseQuantity(quantity);

  useEffect(() => {
    if (!open) return;
    setServiceId(draft.serviceId || NONE);
    setQuantity("1");
    setAmount(draft.amount ? String(draft.amount) : "");
    setAmountEdited(!!draft.amount);
    setCurrency(draft.currency || DEFAULT_CURRENCY);
    setConcept(draft.concept ?? "");
    setMethod("cash");
    setUseItems(!!draft.items && draft.items.length > 0);
    // Solo al abrir: el draft suele ser un objeto nuevo en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Precio del producto × cantidad, mientras nadie haya escrito el monto a mano.
  useEffect(() => {
    if (amountEdited || !product || product.price === null || qty === null) return;
    setAmount(String(product.price * qty));
    setCurrency(product.currency || DEFAULT_CURRENCY);
  }, [product, qty, amountEdited]);

  function chooseProduct(id: string) {
    const next = services.find((s) => s.id === id);
    if (next && (!concept.trim() || concept === product?.name)) setConcept(next.name);
    setServiceId(id);
    setAmountEdited(false);
  }

  const parsed = parseAmount(amount);

  async function saveItems(items: OrderItem[]) {
    setSaving(true);
    const { error } = await insforge.database.from("payments").insert(
      items.map((i) => ({
        organization_id: organizationId,
        amount: (i.unit_price ?? 0) * i.quantity,
        currency: i.currency || DEFAULT_CURRENCY,
        method,
        concept: i.name,
        // El producto pudo haberse borrado de la carta después del pedido (si
        // la carta todavía no cargó, se confía en el id del pedido).
        service_id: services.length === 0 || services.some((s) => s.id === i.service_id) ? i.service_id : null,
        quantity: i.quantity,
        reservation_id: draft.reservationId ?? null,
        customer_id: draft.customerId ?? null
      }))
    );
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo registrar la venta.");
      return;
    }
    toast.success(`Venta registrada: ${items.length} productos.`);
    onOpenChange(false);
    onSaved?.();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (orderItems) {
      await saveItems(orderItems);
      return;
    }
    if (parsed === null || qty === null) {
      toast.error(qty === null ? "La cantidad debe ser un número entre 1 y 999." : "Ingresá un monto mayor a 0.");
      return;
    }
    setSaving(true);
    const { error } = await insforge.database.from("payments").insert([
      {
        organization_id: organizationId,
        amount: parsed,
        currency,
        method,
        concept: concept.trim() || null,
        service_id: product?.id ?? null,
        quantity: qty,
        reservation_id: draft.reservationId ?? null,
        customer_id: draft.customerId ?? null,
        customer_plan_id: draft.customerPlanId ?? null
      }
    ]);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo registrar la venta.");
      return;
    }
    toast.success("Venta registrada.");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Queda en las ventas del día con el medio de pago elegido.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {orderItems ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <ul className="divide-y divide-border text-sm">
                {orderItems.map((i) => (
                  <li key={i.service_id} className="flex gap-3 py-1.5 first:pt-0 last:pb-0">
                    <span className="w-8 shrink-0 font-semibold tabular-nums">{i.quantity}×</span>
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    <span className="shrink-0 tabular-nums">{formatCurrency((i.unit_price ?? 0) * i.quantity, i.currency)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(itemsTotal, orderItems[0].currency)}</span>
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-primary hover:bg-transparent hover:underline" onClick={() => setUseItems(false)}>
                Registrar otro monto
              </Button>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment-product">Producto</Label>
                <Select value={serviceId} onValueChange={chooseProduct}>
                  <SelectTrigger id="payment-product">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin producto (monto libre)</SelectItem>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.price !== null ? ` · ${formatCurrency(s.price, s.currency)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-quantity">Cantidad</Label>
                <Input id="payment-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Monto *</Label>
                <Input
                  id="payment-amount"
                  inputMode="decimal"
                  placeholder="35.000"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setAmountEdited(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-currency">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="payment-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Medio de pago</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Medio de pago">
              {PAYMENT_METHODS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={method === m ? "default" : "outline"}
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                >
                  {PAYMENT_METHOD_LABEL[m]}
                </Button>
              ))}
            </div>
          </div>
          {!orderItems && (
            <div className="space-y-1.5">
              <Label htmlFor="payment-concept">Concepto</Label>
              <Input
                id="payment-concept"
                maxLength={200}
                placeholder="Ej: hamburguesa, propina"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || (!orderItems && (parsed === null || qty === null))}>
              Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

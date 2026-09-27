import { useEffect, useState } from "react";
import { toast } from "sonner";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from "@/lib/currency";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, parseAmount } from "@/lib/payments";
import type { PaymentMethod } from "@/types/domain";

export interface PaymentDraft {
  amount?: number | null;
  currency?: string | null;
  concept?: string | null;
  reservationId?: string | null;
  customerId?: string | null;
  customerPlanId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  draft: PaymentDraft;
  title?: string;
  onSaved?: () => void;
}

/** Registrar un cobro en caja; se usa desde Caja, Reservas y al vender un plan. */
export function PaymentDialog({ open, onOpenChange, organizationId, draft, title = "Registrar cobro", onSaved }: Props) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [concept, setConcept] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(draft.amount ? String(draft.amount) : "");
    setCurrency(draft.currency || DEFAULT_CURRENCY);
    setConcept(draft.concept ?? "");
    setMethod("cash");
    // Solo al abrir: el draft suele ser un objeto nuevo en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = parseAmount(amount);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (parsed === null) {
      toast.error("Ingresá un monto mayor a 0.");
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
        reservation_id: draft.reservationId ?? null,
        customer_id: draft.customerId ?? null,
        customer_plan_id: draft.customerPlanId ?? null
      }
    ]);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo registrar el cobro.");
      return;
    }
    toast.success("Cobro registrado.");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Queda en la caja del día con el medio de pago elegido.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Monto *</Label>
              <Input
                id="payment-amount"
                inputMode="decimal"
                autoFocus
                placeholder="35.000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
          <div className="space-y-1.5">
            <Label htmlFor="payment-concept">Concepto</Label>
            <Input
              id="payment-concept"
              maxLength={200}
              placeholder="Ej: lavado general, propina"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || parsed === null}>
              Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

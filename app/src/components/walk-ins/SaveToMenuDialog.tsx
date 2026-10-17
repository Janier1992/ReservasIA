import { useEffect, useState } from "react";
import { toast } from "sonner";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isNonNegativeNumber } from "@/lib/validation";
import { isOnMenuAlready } from "@/lib/menuDays";
import type { OrderItem, Service } from "@/types/domain";

/** Duración de un producto de la carta (no se agenda: solo es requerida por la tabla). */
const MENU_ITEM_MINUTES = 15;

interface Props {
  organizationId: string;
  /** Lo que escribió el cliente (nombre, qué lleva, precio); null = cerrado. */
  item: Pick<OrderItem, "name" | "includes" | "unit_price"> | null;
  /** Carta actual, para no duplicar un producto que ya existe. */
  services: Pick<Service, "name">[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Guardar en la carta lo que un cliente pidió a mano (fuera de la carta), con
 * su precio: la próxima vez ya aparece en el QR para elegirlo.
 */
export function SaveToMenuDialog({ organizationId, item, services, currency, onClose, onSaved }: Props) {
  const [form, setForm] = useState({ name: "", price: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) setForm({ name: item.name, price: item.unit_price != null ? String(item.unit_price) : "", description: item.includes ?? "" });
  }, [item]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) return;
    if (isOnMenuAlready(name, services)) {
      toast.error(`"${name}" ya está en la carta.`);
      return;
    }
    const price = form.price.trim() ? Number(form.price) : null;
    if (price !== null && !isNonNegativeNumber(price)) {
      toast.error("El precio debe ser un número mayor o igual a 0.");
      return;
    }
    setSaving(true);
    const { error } = await insforge.database.from("services").insert([
      {
        organization_id: organizationId,
        name,
        description: form.description.trim() || null,
        duration_minutes: MENU_ITEM_MINUTES,
        price,
        currency
      }
    ]);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo guardar en la carta.");
      return;
    }
    toast.success(`${name} quedó en la carta. Ya aparece en el QR.`);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar en la carta</DialogTitle>
          <DialogDescription>Un cliente lo pidió fuera de la carta. Guardalo para que la próxima vez aparezca en el QR.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stm-name">Nombre *</Label>
            <Input id="stm-name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stm-price">Precio ({currency})</Label>
            <Input
              id="stm-price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Opcional"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stm-description">Incluye</Label>
            <Input
              id="stm-description"
              maxLength={300}
              placeholder="Opcional"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar en la carta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

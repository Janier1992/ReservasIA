import { useEffect, useState } from "react";
import { toast } from "sonner";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Service, WalkIn } from "@/types/domain";

// Radix Select no admite un item con value "": este valor representa "sin elegir".
const NONE = "none";

interface Props {
  walkIn: WalkIn | null;
  services: Service[];
  showPartySize: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Corregir los datos de alguien en la fila (por ejemplo, si el dictado entendió mal). */
export function WalkInEditDialog({ walkIn, services, showPartySize, onClose, onSaved }: Props) {
  const [form, setForm] = useState({ name: "", phone: "", serviceId: NONE, notes: "", partySize: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!walkIn) return;
    setForm({
      name: walkIn.customer_name,
      phone: walkIn.customer_phone ?? "",
      serviceId: walkIn.service_id ?? NONE,
      notes: walkIn.notes ?? "",
      partySize: walkIn.party_size ? String(walkIn.party_size) : ""
    });
  }, [walkIn]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!walkIn || !form.name.trim()) return;
    const party = form.partySize.trim() ? Number(form.partySize) : null;
    if (party !== null && (!Number.isInteger(party) || party < 1 || party > 200)) {
      toast.error("El número de personas no es válido.");
      return;
    }
    setSaving(true);
    const { error } = await insforge.database
      .from("walk_ins")
      .update({
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim() || null,
        service_id: form.serviceId === NONE ? null : form.serviceId,
        notes: form.notes.trim() || null,
        party_size: party
      })
      .eq("id", walkIn.id);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo guardar.");
      return;
    }
    toast.success("Datos actualizados.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!walkIn} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar registro</DialogTitle>
          <DialogDescription>Los cambios se ven al instante para todo el equipo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-walkin-name">Nombre *</Label>
              <Input id="edit-walkin-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-walkin-phone">Teléfono</Label>
              <Input id="edit-walkin-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-walkin-service">Producto o servicio</Label>
              <Select value={form.serviceId} onValueChange={(v) => setForm({ ...form, serviceId: v })}>
                <SelectTrigger id="edit-walkin-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin definir</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showPartySize && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-walkin-party">Personas</Label>
                <Input id="edit-walkin-party" inputMode="numeric" value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-walkin-notes">Notas</Label>
              <Input id="edit-walkin-notes" maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

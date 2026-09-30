import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildAttributes, normalizePlate, summarizeAsset, type AssetDefinition } from "@/lib/assetTypes";
import type { CustomerAsset } from "@/types/domain";

interface Props {
  organizationId: string;
  customerId: string;
  definition: AssetDefinition;
  canDelete: boolean;
}

type FormState = { id: string | null; label: string; notes: string; values: Record<string, string> };

const EMPTY: FormState = { id: null, label: "", notes: "", values: {} };

function assetErrorMessage(error: { code?: string; message?: string }, definition: AssetDefinition): string {
  if (error.code === "23505") return `Ya existe un ${definition.singular.toLowerCase()} con esa ${definition.labelTitle.toLowerCase()} en tu negocio.`;
  return error.message ?? "No se pudo guardar la ficha.";
}

/** Fichas del cliente según el rubro (vehículos, mascotas, preferencias, estudiantes). */
export function CustomerAssetsSection({ organizationId, customerId, definition, canDelete }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const queryKey = ["customer-assets", organizationId, customerId];

  const { data: assets = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("customer_assets")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as CustomerAsset[];
    }
  });

  const isVehicle = definition.type === "vehicle";

  function edit(asset: CustomerAsset) {
    const values: Record<string, string> = {};
    for (const f of definition.fields) {
      const v = asset.attributes[f.key];
      if (v !== undefined && v !== null) values[f.key] = String(v);
    }
    setForm({ id: asset.id, label: asset.label, notes: asset.notes ?? "", values });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !form.label.trim()) return;
    setSaving(true);
    const row = {
      organization_id: organizationId,
      customer_id: customerId,
      asset_type: definition.type,
      label: isVehicle ? normalizePlate(form.label) : form.label.trim(),
      attributes: buildAttributes(definition, form.values),
      notes: form.notes.trim() || null
    };
    const { error } = form.id
      ? await insforge.database.from("customer_assets").update(row).eq("id", form.id)
      : await insforge.database.from("customer_assets").insert([row]);
    setSaving(false);
    if (error) {
      toast.error(assetErrorMessage(error, definition));
      return;
    }
    toast.success(form.id ? "Ficha actualizada." : `${definition.singular} agregado.`);
    setForm(null);
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["customer-assets-by-org", organizationId] });
  }

  async function remove(asset: CustomerAsset) {
    if (!window.confirm(`¿Eliminar "${asset.label}"? Las reservas vinculadas quedan sin ficha.`)) return;
    const { error } = await insforge.database.from("customer_assets").delete().eq("id", asset.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-medium">{definition.plural}</h4>
        {!form && (
          <Button size="sm" variant="outline" onClick={() => setForm(EMPTY)}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        )}
      </div>

      {form && (
        <form onSubmit={save} className="mb-3 space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="asset-label">{definition.labelTitle} *</Label>
            <Input
              id="asset-label"
              required
              maxLength={80}
              placeholder={definition.labelPlaceholder}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: isVehicle ? e.target.value.toUpperCase() : e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {definition.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`asset-${field.key}`}>{field.label}</Label>
                <Input
                  id={`asset-${field.key}`}
                  type={field.kind === "date" ? "date" : "text"}
                  inputMode={field.kind === "number" ? "decimal" : undefined}
                  placeholder={field.placeholder}
                  value={form.values[field.key] ?? ""}
                  onChange={(e) => setForm({ ...form, values: { ...form.values, [field.key]: e.target.value } })}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-notes">Notas</Label>
            <Textarea id="asset-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving || !form.label.trim()}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {assets.map((asset) => (
          <div key={asset.id} className="flex items-start gap-3 rounded-md border border-border p-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{asset.label}</p>
              <p className="truncate text-xs text-muted-foreground">{summarizeAsset(definition, asset.attributes) || "Sin datos adicionales"}</p>
              {asset.notes && <p className="text-xs text-muted-foreground">{asset.notes}</p>}
            </div>
            <Button size="icon" variant="ghost" aria-label={`Editar ${asset.label}`} onClick={() => edit(asset)}>
              <Pencil className="h-4 w-4" />
            </Button>
            {canDelete && (
              <Button size="icon" variant="ghost" aria-label={`Eliminar ${asset.label}`} onClick={() => remove(asset)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {assets.length === 0 && !form && <p className="text-muted-foreground">Sin {definition.plural.toLowerCase()} registrados.</p>}
      </div>
    </div>
  );
}

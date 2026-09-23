import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBusinessType } from "@/lib/businessTypes";
import type { OnboardingResourceDraft } from "../wizardTypes";

export function Step7Resources({
  value,
  capacityTotal,
  businessType,
  onNext,
  onBack
}: {
  value: OnboardingResourceDraft[];
  capacityTotal: number | null;
  businessType: string;
  onNext: (resources: OnboardingResourceDraft[], capacityTotal: number | null) => void;
  onBack: () => void;
}) {
  const [resources, setResources] = useState<OnboardingResourceDraft[]>(value);
  const [capacity, setCapacity] = useState<string>(capacityTotal ? String(capacityTotal) : "");
  const definition = getBusinessType(businessType);
  const example = definition.resourceExample;
  const hasResources = resources.some((r) => r.name.trim().length > 0);
  const showCapacity = Boolean(definition.groupCapacityHint) && !hasResources;

  const update = (i: number, patch: Partial<OnboardingResourceDraft>) =>
    setResources((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  function handleNext() {
    const filled = resources.filter((r) => r.name.trim().length > 0);
    const parsedCapacity = Number(capacity);
    const capacityValue = showCapacity && Number.isInteger(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : null;
    onNext(filled, capacityValue);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Recursos (opcional)</h2>
        <p className="text-sm text-muted-foreground">
          Cualquier unidad que se reserve de a una persona por horario (ej: {example.name}). Así el agente nunca agenda dos
          clientes al mismo tiempo en el mismo recurso. Si tu negocio no los usa, podés continuar sin agregar ninguno.
        </p>
        {definition.groupCapacityHint && <p className="mt-2 text-sm text-muted-foreground">{definition.groupCapacityHint}</p>}
      </div>
      <div className="space-y-2">
        {resources.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2">
            <Input placeholder={`Nombre (ej: ${example.name})`} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input placeholder={`Tipo (ej: ${example.type})`} value={r.resource_type} onChange={(e) => update(i, { resource_type: e.target.value })} />
            <Input
              type="number"
              className="w-20"
              placeholder="Cap."
              value={r.capacity}
              onChange={(e) => update(i, { capacity: Number(e.target.value) })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setResources((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Quitar recurso"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setResources((prev) => [...prev, { name: "", resource_type: example.type, capacity: 1 }])}
      >
        <Plus className="h-4 w-4" /> Agregar recurso
      </Button>
      {showCapacity && (
        <div className="space-y-1.5 rounded-md border border-border p-3">
          <Label htmlFor="capacity-total">Cupo por horario</Label>
          <Input
            id="capacity-total"
            type="number"
            min={1}
            className="w-32"
            placeholder="Ej: 10"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Cuántas personas pueden reservar el mismo horario. Si lo dejás vacío, se acepta una sola reserva por horario.
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={handleNext}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

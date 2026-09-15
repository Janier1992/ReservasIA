import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OnboardingResourceDraft } from "../wizardTypes";

export function Step7Resources({
  value,
  onNext,
  onBack
}: {
  value: OnboardingResourceDraft[];
  onNext: (resources: OnboardingResourceDraft[]) => void;
  onBack: () => void;
}) {
  const [resources, setResources] = useState<OnboardingResourceDraft[]>(value);

  const update = (i: number, patch: Partial<OnboardingResourceDraft>) =>
    setResources((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Recursos (opcional)</h2>
        <p className="text-sm text-muted-foreground">
          Mesas, barberos, consultorios o cualquier unidad que se reserve individualmente. Si tu negocio no los usa, podés
          continuar sin agregar ninguno.
        </p>
      </div>
      <div className="space-y-2">
        {resources.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2">
            <Input placeholder="Nombre (ej: Mesa 1)" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input placeholder="Tipo (ej: table)" value={r.resource_type} onChange={(e) => update(i, { resource_type: e.target.value })} />
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
        onClick={() => setResources((prev) => [...prev, { name: "", resource_type: "", capacity: 1 }])}
      >
        <Plus className="h-4 w-4" /> Agregar recurso
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => onNext(resources.filter((r) => r.name.trim().length > 0))}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

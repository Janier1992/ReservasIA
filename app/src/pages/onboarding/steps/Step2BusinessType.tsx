import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BUSINESS_TYPES } from "../wizardTypes";

export function Step2BusinessType({ value, onNext, onBack }: { value: string; onNext: (type: string) => void; onBack: () => void }) {
  const [selected, setSelected] = useState(value || "restaurant");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">¿Qué tipo de negocio tenés?</h2>
        <p className="text-sm text-muted-foreground">Esto ayuda a personalizar la experiencia, pero no limita lo que podés configurar.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {BUSINESS_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setSelected(type.value)}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-sm transition-colors",
              selected === type.value ? "border-primary bg-primary/10 font-medium text-primary" : "border-border hover:bg-muted"
            )}
          >
            {type.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => onNext(selected)}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

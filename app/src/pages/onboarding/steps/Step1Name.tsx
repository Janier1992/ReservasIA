import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Step1Name({ value, onNext }: { value: string; onNext: (name: string) => void }) {
  const [name, setName] = useState(value);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">¿Cómo se llama tu negocio?</h2>
        <p className="text-sm text-muted-foreground">Este será el nombre que verán tus clientes.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="business-name">Nombre del negocio</Label>
        <Input id="business-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: La Buena Mesa" />
      </div>
      <Button className="w-full" disabled={name.trim().length < 2} onClick={() => onNext(name.trim())}>
        Continuar
      </Button>
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMEZONES = [
  "America/Bogota",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/Lima",
  "America/New_York",
  "Europe/Madrid"
];

export function Step3Timezone({ value, onNext, onBack }: { value: string; onNext: (tz: string) => void; onBack: () => void }) {
  const [timezone, setTimezone] = useState(value || "America/Bogota");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">¿En qué zona horaria opera tu negocio?</h2>
        <p className="text-sm text-muted-foreground">Todas las reservas y horarios se calculan con esta zona horaria.</p>
      </div>
      <Select value={timezone} onValueChange={setTimezone}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIMEZONES.map((tz) => (
            <SelectItem key={tz} value={tz}>
              {tz}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => onNext(timezone)}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

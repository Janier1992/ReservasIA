import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { OnboardingHoursDraft } from "../wizardTypes";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function Step5Hours({
  value,
  onNext,
  onBack
}: {
  value: OnboardingHoursDraft[];
  onNext: (hours: OnboardingHoursDraft[]) => void;
  onBack: () => void;
}) {
  const [hours, setHours] = useState(value);

  const update = (day: number, patch: Partial<OnboardingHoursDraft>) => {
    setHours((prev) => prev.map((h) => (h.day_of_week === day ? { ...h, ...patch } : h)));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Horarios de atención</h2>
        <p className="text-sm text-muted-foreground">Podés ajustar horarios partidos más adelante desde el dashboard.</p>
      </div>
      <div className="space-y-2">
        {hours.map((h) => (
          <div key={h.day_of_week} className="flex items-center gap-3 rounded-md border border-border p-2">
            <span className="w-24 text-sm font-medium">{DAY_NAMES[h.day_of_week]}</span>
            <Switch checked={!h.is_closed} onCheckedChange={(checked) => update(h.day_of_week, { is_closed: !checked })} />
            {!h.is_closed ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-28"
                  value={h.opening_time}
                  onChange={(e) => update(h.day_of_week, { opening_time: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">a</span>
                <Input
                  type="time"
                  className="w-28"
                  value={h.closing_time}
                  onChange={(e) => update(h.day_of_week, { closing_time: e.target.value })}
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Cerrado</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => onNext(hours)}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from "@/lib/currency";
import { getBusinessType } from "@/lib/businessTypes";
import type { OnboardingServiceDraft } from "../wizardTypes";

function initialServices(value: OnboardingServiceDraft[], businessType: string): OnboardingServiceDraft[] {
  if (value.length > 0) return value;
  const suggested = getBusinessType(businessType).suggestedServices;
  if (suggested.length === 0) return [{ name: "", duration_minutes: 60, price: null, currency: DEFAULT_CURRENCY }];
  return suggested.map((s) => ({ ...s, price: null, currency: DEFAULT_CURRENCY }));
}

export function Step6Services({
  value,
  businessType,
  onNext,
  onBack
}: {
  value: OnboardingServiceDraft[];
  businessType: string;
  onNext: (services: OnboardingServiceDraft[]) => void;
  onBack: () => void;
}) {
  const [services, setServices] = useState<OnboardingServiceDraft[]>(() => initialServices(value, businessType));
  const usingSuggestions = value.length === 0 && getBusinessType(businessType).suggestedServices.length > 0;

  const update = (i: number, patch: Partial<OnboardingServiceDraft>) =>
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Servicios que ofrecés</h2>
        <p className="text-sm text-muted-foreground">
          {usingSuggestions
            ? "Te sugerimos algunos servicios típicos de tu rubro. Ajustá nombres y duraciones, poné tus precios y borrá los que no ofrezcas."
            : 'Ej: "Corte de cabello", "Reserva de mesa", "Consulta inicial".'}
        </p>
      </div>
      <div className="space-y-2">
        {services.map((s, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2">
            <Input placeholder="Nombre del servicio" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input
              type="number"
              className="w-24"
              placeholder="Min"
              value={s.duration_minutes}
              onChange={(e) => update(i, { duration_minutes: Number(e.target.value) })}
            />
            <Input
              type="number"
              className="w-28"
              placeholder="Precio"
              value={s.price ?? ""}
              onChange={(e) => update(i, { price: e.target.value ? Number(e.target.value) : null })}
            />
            <Select value={s.currency} onValueChange={(currency) => update(i, { currency })}>
              <SelectTrigger className="w-24">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setServices((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Quitar servicio"
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
        onClick={() => setServices((prev) => [...prev, { name: "", duration_minutes: 60, price: null, currency: DEFAULT_CURRENCY }])}
      >
        <Plus className="h-4 w-4" /> Agregar servicio
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => onNext(services.filter((s) => s.name.trim().length > 0))}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

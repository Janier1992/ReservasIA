import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DAY_NAMES, WEEK_ORDER, validateHourPeriods, type HourPeriodDraft } from "@/lib/schedule";
import type { Resource, ResourceHourPeriod } from "@/types/domain";

interface Props {
  resource: Resource | null;
  periods: ResourceHourPeriod[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Horario propio de un recurso (ej. el barbero que solo trabaja mañanas).
 * Sin horario propio, el recurso sigue el horario del negocio. El agente y
 * la página pública solo ofrecen ese recurso dentro de sus franjas.
 */
export function ResourceHoursDialog({ resource, periods, onOpenChange, onSaved }: Props) {
  const [ownSchedule, setOwnSchedule] = useState(false);
  const [drafts, setDrafts] = useState<HourPeriodDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!resource) return;
    const own = periods.filter((p) => p.resource_id === resource.id);
    setOwnSchedule(own.length > 0);
    setDrafts(
      own.length > 0
        ? own.map((p) => ({ day_of_week: p.day_of_week, opening_time: p.opening_time.slice(0, 5), closing_time: p.closing_time.slice(0, 5) }))
        : [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, opening_time: "09:00", closing_time: "18:00" }))
    );
  }, [resource, periods]);

  function update(index: number, patch: Partial<HourPeriodDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function save() {
    if (!resource) return;
    const toSave = ownSchedule ? drafts : [];
    if (ownSchedule && toSave.length === 0) {
      toast.error("Agregá al menos una franja o usá el horario del negocio.");
      return;
    }
    const invalid = validateHourPeriods(toSave);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    const { error: deleteError } = await insforge.database.from("resource_hour_periods").delete().eq("resource_id", resource.id);
    const { error } =
      deleteError || toSave.length === 0
        ? { error: deleteError }
        : await insforge.database
            .from("resource_hour_periods")
            .insert(toSave.map((d) => ({ ...d, organization_id: resource.organization_id, resource_id: resource.id })));
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo guardar el horario.");
      return;
    }
    toast.success(ownSchedule ? `Horario de ${resource.name} guardado.` : `${resource.name} sigue el horario del negocio.`);
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={!!resource} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Horario de {resource?.name}</DialogTitle>
          <DialogDescription>Solo se le asignan reservas dentro de estas franjas. Para días puntuales (vacaciones, permisos) usá Bloqueos en Reservas.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Switch id="own-schedule" checked={ownSchedule} onCheckedChange={setOwnSchedule} />
          <Label htmlFor="own-schedule">Tiene horario propio</Label>
        </div>

        {ownSchedule ? (
          <div className="space-y-2">
            {WEEK_ORDER.map((day) => {
              const rows = drafts.map((d, index) => ({ d, index })).filter(({ d }) => d.day_of_week === day);
              return (
                <div key={day} className="flex flex-wrap items-start gap-2 border-b border-border pb-2 last:border-0">
                  <span className="w-24 pt-2 text-sm font-medium">{DAY_NAMES[day]}</span>
                  <div className="flex flex-1 flex-col gap-1.5">
                    {rows.length === 0 && <span className="pt-2 text-sm text-muted-foreground">No trabaja</span>}
                    {rows.map(({ d, index }) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          className="h-9 w-32"
                          aria-label={`${DAY_NAMES[day]} entrada`}
                          value={d.opening_time}
                          onChange={(e) => update(index, { opening_time: e.target.value })}
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          className="h-9 w-32"
                          aria-label={`${DAY_NAMES[day]} salida`}
                          value={d.closing_time}
                          onChange={(e) => update(index, { closing_time: e.target.value })}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          aria-label={`Quitar franja del ${DAY_NAMES[day]}`}
                          onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    aria-label={`Agregar franja el ${DAY_NAMES[day]}`}
                    onClick={() => setDrafts((prev) => [...prev, { day_of_week: day, opening_time: "09:00", closing_time: "13:00" }])}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Trabaja en el horario general del negocio (Configuración).</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

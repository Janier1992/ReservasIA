import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upcomingDates } from "@/lib/publicBookingUtils";
import { blockRange, formatBlockRange, overlappingReservations, type BlockForm } from "@/lib/schedule";
import type { Reservation, Resource, ScheduleBlock } from "@/types/domain";

// Radix Select no admite value "": representa "todo el negocio".
const WHOLE_BUSINESS = "all";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  timezone: string;
  resources: Resource[];
  resourceLabel: string;
  canManageAll: boolean;
  reservations: Pick<Reservation, "start_at" | "end_at" | "resource_id" | "status">[];
}

/**
 * Bloqueos de agenda: vacaciones, almuerzo, festivos, mantenimiento. Un
 * bloqueo impide reservar en esa franja por cualquier canal (lo valida la
 * base); las reservas que ya existían no se tocan, solo se avisa.
 */
export function ScheduleBlocksDialog({ open, onOpenChange, organizationId, timezone, resources, resourceLabel, canManageAll, reservations }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = upcomingDates(timezone, 1)[0];
  const [target, setTarget] = useState(WHOLE_BUSINESS);
  const [form, setForm] = useState<BlockForm>({ startDate: today, endDate: today, allDay: false, startTime: "12:00", endTime: "13:00" });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const queryKey = ["schedule-blocks", organizationId];

  const { data: blocks = [] } = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("schedule_blocks")
        .select("*, resources(name)")
        .eq("organization_id", organizationId)
        .gt("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data as ScheduleBlock[];
    }
  });

  const range = blockRange(form, timezone);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!range) {
      toast.error("Revisá las fechas: el fin tiene que ser después del inicio.");
      return;
    }
    const resourceId = target === WHOLE_BUSINESS ? null : target;
    setSaving(true);
    const { error } = await insforge.database
      .from("schedule_blocks")
      .insert([{ organization_id: organizationId, resource_id: resourceId, ...range, reason: reason.trim() || null }]);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo crear el bloqueo.");
      return;
    }
    const clashes = overlappingReservations(reservations, { ...range, resource_id: resourceId });
    if (clashes.length > 0) {
      toast.warning(
        `Bloqueo creado. Ojo: ya hay ${clashes.length} ${clashes.length === 1 ? "reserva" : "reservas"} en esa franja; reprogramalas o avisale al cliente.`,
        { duration: 8000 }
      );
    } else {
      toast.success("Bloqueo creado. Nadie podrá reservar en esa franja.");
    }
    setReason("");
    queryClient.invalidateQueries({ queryKey });
  }

  async function remove(block: ScheduleBlock) {
    const { error } = await insforge.database.from("schedule_blocks").delete().eq("id", block.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bloqueos de agenda</DialogTitle>
          <DialogDescription>Vacaciones, almuerzo, festivos o mantenimiento: en esa franja no se puede reservar por ningún canal.</DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="block-target">Qué se bloquea</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="block-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_BUSINESS}>Todo el negocio</SelectItem>
                {resources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {resourceLabel}: {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="block-all-day" checked={form.allDay} onCheckedChange={(v) => setForm({ ...form, allDay: v })} />
            <Label htmlFor="block-all-day">Días completos</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="block-start-date">Desde</Label>
              <Input
                id="block-start-date"
                type="date"
                min={today}
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-end-date">Hasta</Label>
              <Input
                id="block-end-date"
                type="date"
                min={form.startDate}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            {!form.allDay && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="block-start-time">Hora inicio</Label>
                  <Input id="block-start-time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="block-end-time">Hora fin</Label>
                  <Input id="block-end-time" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-reason">Motivo</Label>
            <Input
              id="block-reason"
              maxLength={120}
              placeholder="Ej: almuerzo, vacaciones, festivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={saving || !range}>
            Bloquear
          </Button>
        </form>

        <div className="space-y-2 text-sm">
          <h4 className="font-medium">Próximos bloqueos</h4>
          {blocks.length === 0 && <p className="text-muted-foreground">No hay bloqueos programados.</p>}
          {blocks.map((b) => (
            <div key={b.id} className="flex items-start gap-3 rounded-md border border-border p-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium first-letter:uppercase">{formatBlockRange(b.starts_at, b.ends_at, timezone)}</p>
                <p className="text-xs text-muted-foreground">
                  {[b.resources?.name ?? "Todo el negocio", b.reason].filter(Boolean).join(" · ")}
                </p>
              </div>
              {(canManageAll || b.created_by === user?.id) && (
                <Button size="icon" variant="ghost" aria-label="Quitar bloqueo" onClick={() => remove(b)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

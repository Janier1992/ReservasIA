import { useMemo, useState } from "react";
import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { reservationStatusLabel, reservationStatusVariant } from "@/lib/reservationStatus";
import { layoutOverlapping } from "@/lib/calendarLayout";
import type { Reservation } from "@/types/domain";

const ROW_HEIGHT_PX = 56;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const MIN_VISIBLE_HOURS = 4;

// El color solo no alcanza para distinguir estados (primary y destructive son
// tonos cercanos en la paleta cálida del tema claro, y eso puede resultar
// indistinguible para alguien con daltonismo) — por eso cancelada/no-show
// suman un borde punteado y el horario tachado, no solo un tinte rojizo.
function blockColorClass(status: Reservation["status"]): string {
  switch (status) {
    case "cancelled":
    case "no_show":
      return "border-dashed border-destructive/40 bg-destructive/10 text-destructive";
    case "completed":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-primary/30 bg-primary/10 text-primary";
  }
}

export function ReservationsCalendarView({
  reservations,
  onComplete,
  onNoShow,
  onCancel,
  onRemove
}: {
  reservations: Reservation[];
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<Reservation | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const weekReservations = useMemo(
    () => reservations.filter((r) => new Date(r.start_at) >= weekStart && new Date(r.start_at) < weekEnd),
    [reservations, weekStart, weekEnd]
  );

  const { startHour, endHour } = useMemo(() => {
    let min = DEFAULT_START_HOUR;
    let max = DEFAULT_END_HOUR;
    for (const r of weekReservations) {
      const start = new Date(r.start_at);
      const end = new Date(r.end_at);
      min = Math.min(min, start.getHours());
      max = Math.max(max, end.getHours() + (end.getMinutes() > 0 ? 1 : 0));
    }
    if (max - min < MIN_VISIBLE_HOURS) max = min + MIN_VISIBLE_HOURS;
    return { startHour: min, endHour: max };
  }, [weekReservations]);

  const hours = useMemo(() => Array.from({ length: endHour - startHour }, (_, i) => startHour + i), [startHour, endHour]);
  const gridHeight = hours.length * ROW_HEIGHT_PX;

  function reservationsForDay(day: Date): Reservation[] {
    return weekReservations.filter((r) => isSameDay(new Date(r.start_at), day));
  }

  function offsetPx(date: Date): number {
    const hourDecimal = date.getHours() + date.getMinutes() / 60;
    return (hourDecimal - startHour) * ROW_HEIGHT_PX;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => subWeeks(d, 1))} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => addWeeks(d, 1))} aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-medium capitalize">
          {format(weekStart, "d MMM", { locale: es })} – {format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border">
            <div />
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={cn("border-l border-border p-2 text-center", isSameDay(day, new Date()) && "bg-primary/5")}
              >
                <div className="text-[11px] uppercase text-muted-foreground">{format(day, "EEE", { locale: es })}</div>
                <div className={cn("text-sm font-semibold", isSameDay(day, new Date()) && "text-primary")}>{format(day, "d")}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: gridHeight }}>
            <div className="relative">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                  style={{ top: (h - startHour) * ROW_HEIGHT_PX }}
                >
                  {h}:00
                </div>
              ))}
            </div>

            {days.map((day) => {
              const laidOut = layoutOverlapping(reservationsForDay(day));
              return (
                <div key={day.toISOString()} className="relative border-l border-border">
                  {hours.map((h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-border/60" style={{ top: (h - startHour) * ROW_HEIGHT_PX }} />
                  ))}
                  {laidOut.map(({ item: r, lane, lanes }) => {
                    const start = new Date(r.start_at);
                    const end = new Date(r.end_at);
                    const top = offsetPx(start);
                    const height = Math.max(offsetPx(end) - top, 18);
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={cn(
                          "absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-opacity hover:opacity-80",
                          blockColorClass(r.status)
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${(lane * 100) / lanes}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`
                        }}
                      >
                        <div className={cn("font-medium", (r.status === "cancelled" || r.status === "no_show") && "line-through")}>
                          {format(start, "HH:mm")}
                        </div>
                        <div className="truncate">{r.customer_name || r.customers?.name || r.customers?.phone}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.customer_name || selected.customers?.name || selected.customers?.phone}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{new Date(selected.start_at).toLocaleString()}</span>
                  <Badge variant={reservationStatusVariant(selected.status)}>{reservationStatusLabel(selected.status)}</Badge>
                </div>
                {selected.services?.name && <p>Servicio: {selected.services.name}</p>}
                {selected.resources?.name && <p>Recurso: {selected.resources.name}</p>}
                {selected.special_requests && <p className="text-muted-foreground">Notas: {selected.special_requests}</p>}

                <div className="flex flex-wrap gap-2 pt-2">
                  {(selected.status === "pending" || selected.status === "confirmed") && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onComplete(selected.id);
                          setSelected(null);
                        }}
                      >
                        Completar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onNoShow(selected.id);
                          setSelected(null);
                        }}
                      >
                        No-show
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          onCancel(selected.id);
                          setSelected(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  {(selected.status === "cancelled" || selected.status === "completed" || selected.status === "no_show") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onRemove(selected.id);
                        setSelected(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" /> Eliminar
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

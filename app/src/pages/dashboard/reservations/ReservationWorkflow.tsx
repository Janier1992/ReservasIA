import { ArrowLeft, ArrowRight, BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adjacentStage, boardReservations, currentStage, type Workflow } from "@/lib/workflows";
import type { CustomerAsset, Reservation } from "@/types/domain";

const NO_ASSET = "none";

export type ReservationWithAsset = Reservation & { customer_assets?: Pick<CustomerAsset, "label" | "asset_type"> | null };

export function StageSelect({
  workflow,
  reservation,
  onChange
}: {
  workflow: Workflow;
  reservation: Reservation;
  onChange: (stage: string) => void;
}) {
  return (
    <Select value={currentStage(workflow, reservation.stage).key} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44 text-xs" aria-label="Etapa">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {workflow.stages.map((s) => (
          <SelectItem key={s.key} value={s.key}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssetSelect({
  assets,
  reservation,
  label,
  onChange
}: {
  assets: CustomerAsset[];
  reservation: Reservation;
  label: string;
  onChange: (assetId: string | null) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <Select value={reservation.asset_id ?? NO_ASSET} onValueChange={(v) => onChange(v === NO_ASSET ? null : v)}>
      <SelectTrigger className="mt-1 h-7 w-40 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ASSET}>Sin {label.toLowerCase()}</SelectItem>
        {assets.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Tablero por etapas: una columna por etapa del rubro con las reservas
 * activas. Mover una tarjeta es cambiar su etapa; en la etapa de aviso
 * (ej. "listo para entregar") se puede escribirle al cliente por su chat.
 */
export function ReservationsBoardView({
  workflow,
  reservations,
  timezone,
  onStageChange,
  onNotify,
  onComplete
}: {
  workflow: Workflow;
  reservations: ReservationWithAsset[];
  timezone: string;
  onStageChange: (reservation: Reservation, stage: string) => void;
  onNotify: (reservation: Reservation) => void;
  onComplete: (reservation: Reservation) => void;
}) {
  const active = boardReservations(workflow, reservations);
  const time = (iso: string) =>
    new Date(iso).toLocaleString("es-CO", { timeZone: timezone, weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-max auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3">
        {workflow.stages.map((stage) => {
          const items = active.filter((r) => currentStage(workflow, r.stage).key === stage.key);
          return (
            <section key={stage.key} className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3" aria-label={stage.label}>
              <header className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{stage.label}</h3>
                <span className="rounded-full bg-card px-2 text-xs text-muted-foreground">{items.length}</span>
              </header>
              {items.map((r) => {
                const prev = adjacentStage(workflow, r.stage, -1);
                const next = adjacentStage(workflow, r.stage, 1);
                const isNotifyStage = workflow.notifyStage === stage.key;
                return (
                  <article key={r.id} className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{r.customer_name || r.customers?.name || r.customers?.phone || "Cliente"}</p>
                      {r.customer_assets?.label && (
                        <span className="shrink-0 rounded border border-foreground/30 bg-secondary/20 px-1.5 font-mono text-xs font-semibold">
                          {r.customer_assets.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[r.services?.name, r.resources?.name, time(r.start_at)].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={!prev}
                        onClick={() => prev && onStageChange(r, prev.key)}
                        aria-label={prev ? `Volver a ${prev.label}` : "Primera etapa"}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      {next ? (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => onStageChange(r, next.key)}>
                          {next.label} <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button size="sm" className="h-8" onClick={() => onComplete(r)}>
                          <Check className="h-3.5 w-3.5" /> Completar
                        </Button>
                      )}
                      {isNotifyStage && r.conversation_id && (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => onNotify(r)}>
                          <BellRing className="h-3.5 w-3.5" /> Avisar
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Vacío</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

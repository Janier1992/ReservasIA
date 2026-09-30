import type { ReactNode } from "react";
import { Bell, Check, Pencil, QrCode, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatWait, minutesBetween, notifyStatus } from "@/lib/walkIns";
import type { WalkIn } from "@/types/domain";

interface Props {
  walkIn: WalkIn;
  /** Puesto en la fila (solo en espera). */
  position?: number;
  now: Date;
  busy: boolean;
  canDelete: boolean;
  timeLabel: (iso: string) => string;
  /** Selector de recurso para atender (solo en espera). */
  resourceSelect?: ReactNode;
  onServe?: () => void;
  onComplete: () => void;
  onReady: () => void;
  onEdit: () => void;
  onLeft?: () => void;
  onDelete: () => void;
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button size="icon" variant="ghost" onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      {children}
    </Button>
  );
}

export function detailLine(w: WalkIn): string {
  return [w.services?.name ?? "Sin producto definido", w.party_size ? `${w.party_size} personas` : null, w.reservations?.resources?.name, w.notes]
    .filter(Boolean)
    .join(" · ");
}

/** Una persona en la fila (en espera o en atención) con todas sus acciones. */
export function WalkInCard({ walkIn: w, position, now, busy, canDelete, timeLabel, resourceSelect, onServe, onComplete, onReady, onEdit, onLeft, onDelete }: Props) {
  const inService = w.status === "in_service";
  const notify = notifyStatus(w);
  const name = w.customer_name;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center",
        inService ? "border-primary/30 bg-primary/5" : "border-border",
        w.ready_at && "ring-2 ring-success/40"
      )}
    >
      <div className="flex flex-1 items-start gap-3">
        {position !== undefined && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">{position}</span>
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {name}
            {w.source === "qr" && (
              <Badge variant="muted" className="gap-1">
                <QrCode className="h-3 w-3" /> QR
              </Badge>
            )}
            {w.reservations && w.reservations.source !== "walk_in" && <Badge variant="default">Reserva {timeLabel(w.reservations.start_at)}</Badge>}
            {notify && <Badge variant={notify.variant}>{notify.label}</Badge>}
          </p>
          <p className="text-sm text-muted-foreground">{detailLine(w)}</p>
          <p className="text-xs text-muted-foreground">
            {inService && w.served_at ? `En atención hace ${formatWait(minutesBetween(w.served_at, now))}` : `Esperando: ${formatWait(minutesBetween(w.arrived_at, now))}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {resourceSelect}
        {!inService && onServe && (
          <Button size="sm" onClick={onServe} disabled={busy}>
            Atender
          </Button>
        )}
        <Button size="sm" variant={inService ? "default" : "outline"} onClick={onComplete} disabled={busy}>
          <Check className="h-4 w-4" /> {inService ? "Finalizar" : "Atendido"}
        </Button>
        <IconAction label={w.ready_at ? `${name}: ya está marcado listo` : `Marcar listo y avisar a ${name}`} onClick={onReady} disabled={busy || !!w.ready_at}>
          <Bell className="h-4 w-4" />
        </IconAction>
        <IconAction label={`Editar ${name}`} onClick={onEdit} disabled={busy}>
          <Pencil className="h-4 w-4" />
        </IconAction>
        {!inService && onLeft && (
          <IconAction label={`${name} se fue sin ser atendido`} onClick={onLeft} disabled={busy}>
            <UserX className="h-4 w-4" />
          </IconAction>
        )}
        {canDelete && (
          <IconAction label={`Eliminar el registro de ${name}`} onClick={onDelete} disabled={busy}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </IconAction>
        )}
      </div>
    </div>
  );
}

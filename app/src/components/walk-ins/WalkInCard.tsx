import type { ReactNode } from "react";
import { Bell, Check, Pencil, QrCode, Trash2, User, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatTicket, formatWait, minutesBetween, notifyStatus, serviceProgress, walkInAssetLabel } from "@/lib/walkIns";
import type { WalkIn } from "@/types/domain";

interface Props {
  walkIn: WalkIn;
  /** Puesto en la fila (solo en espera); el número grande de la tarjeta es el ticket. */
  position?: number;
  now: Date;
  busy: boolean;
  canDelete: boolean;
  timeLabel: (iso: string) => string;
  /** Modo pantalla: tarjeta más grande, para un televisor o una pantalla del local. */
  display?: boolean;
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

/** Detalle de la atención; los productos de un pedido por QR se listan aparte. */
export function detailLine(w: WalkIn): string {
  const what = w.order_items?.length ? null : w.services?.name || "Sin producto definido";
  return [what, w.party_size ? `${w.party_size} personas` : null, w.notes].filter(Boolean).join(" · ");
}

/**
 * Una atención como tarjeta del tablero: en espera, en atención (con barra de
 * tiempo contra la duración del servicio) o lista para entregar.
 */
export function WalkInCard({ walkIn: w, position, now, busy, canDelete, timeLabel, display, resourceSelect, onServe, onComplete, onReady, onEdit, onLeft, onDelete }: Props) {
  const inService = w.status === "in_service";
  // Un pedido puede quedar listo sin haber pasado por "Atender" (ej. pedido por QR).
  const ready = !!w.ready_at;
  const notify = notifyStatus(w);
  const name = w.customer_name;
  const asset = walkInAssetLabel(w);
  const ticket = formatTicket(w.ticket_number);
  // Lo que se ve de lejos: la placa (o la mascota) si la reserva la tiene; si no, el ticket.
  const headline = asset ?? ticket;
  const resource = w.reservations?.resources?.name;
  const progress = inService && !ready ? serviceProgress(w, now) : null;
  const detail = detailLine(w);

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm",
        ready ? "border-success/60 bg-success/5 ring-1 ring-success/30" : progress?.overdue ? "border-destructive/50" : inService ? "border-primary/40" : "border-border",
        display && "gap-4 p-5"
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {headline ? (
            <span
              className={cn(
                "truncate rounded-md border-2 border-primary/50 bg-background px-2.5 py-0.5 font-mono font-bold uppercase tracking-[0.15em]",
                display ? "text-2xl" : "text-lg"
              )}
              aria-label={asset ? undefined : `Ticket ${ticket}`}
            >
              {headline}
            </span>
          ) : (
            <span className={cn("truncate font-display font-semibold", display ? "text-2xl" : "text-lg")}>{name}</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {ready && <Badge variant="success">Listo</Badge>}
          {resource && <Badge variant="default">{resource}</Badge>}
        </div>
      </header>

      <div className={cn("space-y-1", display ? "text-base" : "text-sm")}>
        {w.order_items && w.order_items.length > 0 && (
          <ul aria-label={`Pedido de ${name}`}>
            {w.order_items.map((item) => (
              <li key={item.service_id} className="font-medium">
                <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.name}
              </li>
            ))}
          </ul>
        )}
        {detail && <p className={cn(w.order_items?.length ? "text-muted-foreground" : "font-medium")}>{detail}</p>}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          {headline && (
            <span className={cn("inline-flex items-center gap-1 font-medium text-foreground", display && "text-lg")}>
              <User className="h-3.5 w-3.5" /> {name}
            </span>
          )}
          {asset && ticket && <span className="font-mono text-xs font-semibold">{ticket}</span>}
          {w.source === "qr" && (
            <Badge variant="muted" className="gap-1">
              <QrCode className="h-3 w-3" /> QR
            </Badge>
          )}
          {w.reservations && w.reservations.source !== "walk_in" && <Badge variant="muted">Reserva {timeLabel(w.reservations.start_at)}</Badge>}
          {notify && <Badge variant={notify.variant}>{notify.label}</Badge>}
        </p>
      </div>

      {progress ? (
        <div className="space-y-1.5">
          <div className={cn("flex justify-between gap-2 tabular-nums", display ? "text-sm" : "text-xs")}>
            <span className={cn(progress.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
              {progress.expected ? `${progress.elapsed} min / ${progress.expected} min` : `En atención hace ${formatWait(progress.elapsed)}`}
            </span>
            {progress.remaining !== null && (
              <span className={cn(progress.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {progress.overdue ? `+${-progress.remaining} min` : `${progress.remaining} min restantes`}
              </span>
            )}
          </div>
          {progress.ratio !== null && (
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`Tiempo de atención de ${name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.ratio * 100)}
            >
              <div className={cn("h-full rounded-full transition-all", progress.overdue ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
            </div>
          )}
        </div>
      ) : (
        <p className={cn("text-muted-foreground", display ? "text-sm" : "text-xs")}>
          {ready && w.ready_at
            ? `Listo hace ${formatWait(minutesBetween(w.ready_at, now))}${display ? " · acercate a reclamarlo" : ""}`
            : `Esperando ${formatWait(minutesBetween(w.arrived_at, now))}${position !== undefined ? ` · ${position}.º en la fila` : ""}`}
        </p>
      )}

      {/* Las acciones están también en modo pantalla: el equipo opera desde ahí. */}
      <footer className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {resourceSelect}
        {!inService && !ready && onServe && (
          <Button size="sm" onClick={onServe} disabled={busy}>
            Atender
          </Button>
        )}
        <Button size="sm" variant={inService ? "default" : "outline"} onClick={onComplete} disabled={busy}>
          <Check className="h-4 w-4" /> {ready ? "Entregado" : inService ? "Finalizar" : "Atendido"}
        </Button>
        <div className="ml-auto flex items-center">
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
      </footer>
    </article>
  );
}

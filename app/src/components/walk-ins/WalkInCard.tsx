import type { ReactNode } from "react";
import { Bell, Check, Pencil, QrCode, Trash2, User, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatTicket, formatWait, minutesBetween, notifyStatus, serviceProgress, walkInAssetLabel, type CardSize } from "@/lib/walkIns";
import type { WalkIn } from "@/types/domain";

interface Props {
  walkIn: WalkIn;
  /** Puesto en la fila (solo en espera); el número grande de la tarjeta es el ticket. */
  position?: number;
  now: Date;
  busy: boolean;
  canDelete: boolean;
  timeLabel: (iso: string) => string;
  /** Modo pantalla: para un televisor o una pantalla del local. */
  display?: boolean;
  /** Tamaño según cuántas atenciones hay (ver boardDensity). */
  size?: CardSize;
  /** Selector de recurso para atender (solo en espera). */
  resourceSelect?: ReactNode;
  onServe?: () => void;
  onComplete: () => void;
  onReady: () => void;
  onEdit: () => void;
  onLeft?: () => void;
  onDelete: () => void;
}

/** Clases por tamaño de tarjeta: más atenciones, tarjetas más compactas. */
const SIZE = {
  lg: { card: "gap-4 p-5", headline: "text-2xl", body: "text-base", name: "text-lg", meta: "text-sm", footer: "pt-3", button: "", icon: "" },
  md: { card: "gap-3 p-4", headline: "text-lg", body: "text-sm", name: "", meta: "text-xs", footer: "pt-3", button: "", icon: "" },
  sm: { card: "gap-2 p-3", headline: "text-base", body: "text-sm", name: "", meta: "text-xs", footer: "pt-2", button: "h-8 px-2.5 text-xs", icon: "h-8 w-8" },
  xs: { card: "gap-1.5 p-2.5", headline: "text-sm", body: "text-xs", name: "", meta: "text-[11px]", footer: "pt-2", button: "h-7 px-2 text-xs", icon: "h-7 w-7" }
} satisfies Record<CardSize, Record<string, string>>;

function IconAction({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: ReactNode }) {
  return (
    <Button size="icon" variant="ghost" className={className} onClick={onClick} disabled={disabled} title={label} aria-label={label}>
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
export function WalkInCard({
  walkIn: w,
  position,
  now,
  busy,
  canDelete,
  timeLabel,
  display,
  size = display ? "lg" : "md",
  resourceSelect,
  onServe,
  onComplete,
  onReady,
  onEdit,
  onLeft,
  onDelete
}: Props) {
  const sz = SIZE[size];
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
        "flex flex-col rounded-xl border bg-card shadow-sm",
        sz.card,
        ready ? "border-success/60 bg-success/5 ring-1 ring-success/30" : progress?.overdue ? "border-destructive/50" : inService ? "border-primary/40" : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {headline ? (
            <span
              className={cn(
                "truncate rounded-md border-2 border-primary/50 bg-background px-2 py-0.5 font-mono font-bold uppercase tracking-[0.15em]",
                sz.headline
              )}
              aria-label={asset ? undefined : `Ticket ${ticket}`}
            >
              {headline}
            </span>
          ) : (
            <span className={cn("truncate font-display font-semibold", sz.headline)}>{name}</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {ready && <Badge variant="success">Listo</Badge>}
          {resource && <Badge variant="default">{resource}</Badge>}
        </div>
      </header>

      <div className={cn("space-y-1", sz.body)}>
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
            <span className={cn("inline-flex items-center gap-1 font-medium text-foreground", sz.name)}>
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
          <div className={cn("flex justify-between gap-2 tabular-nums", sz.meta)}>
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
        <p className={cn("text-muted-foreground", sz.meta)}>
          {ready && w.ready_at
            ? `Listo hace ${formatWait(minutesBetween(w.ready_at, now))}${display ? " · acercate a reclamarlo" : ""}`
            : `Esperando ${formatWait(minutesBetween(w.arrived_at, now))}${position !== undefined ? ` · ${position}.º en la fila` : ""}`}
        </p>
      )}

      {/* Las acciones están también en modo pantalla: el equipo opera desde ahí. */}
      <footer className={cn("flex flex-wrap items-center gap-1.5 border-t border-border", sz.footer)}>
        {resourceSelect}
        {!inService && !ready && onServe && (
          <Button size="sm" className={sz.button} onClick={onServe} disabled={busy}>
            Atender
          </Button>
        )}
        <Button size="sm" className={sz.button} variant={inService ? "default" : "outline"} onClick={onComplete} disabled={busy}>
          <Check className="h-4 w-4" /> {ready ? "Entregado" : inService ? "Finalizar" : "Atendido"}
        </Button>
        <div className="ml-auto flex items-center">
          <IconAction className={sz.icon} label={w.ready_at ? `${name}: ya está marcado listo` : `Marcar listo y avisar a ${name}`} onClick={onReady} disabled={busy || !!w.ready_at}>
            <Bell className="h-4 w-4" />
          </IconAction>
          <IconAction className={sz.icon} label={`Editar ${name}`} onClick={onEdit} disabled={busy}>
            <Pencil className="h-4 w-4" />
          </IconAction>
          {!inService && onLeft && (
            <IconAction className={sz.icon} label={`${name} se fue sin ser atendido`} onClick={onLeft} disabled={busy}>
              <UserX className="h-4 w-4" />
            </IconAction>
          )}
          {canDelete && (
            <IconAction className={sz.icon} label={`Eliminar el registro de ${name}`} onClick={onDelete} disabled={busy}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </IconAction>
          )}
        </div>
      </footer>
    </article>
  );
}

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Monitor, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LiveClock } from "./LiveClock";

/** Encabezado del tablero: título (o el negocio en modo pantalla), indicador en vivo, reloj y modo pantalla. */
export function WalkInBoardHeader({
  display,
  businessName,
  logoUrl,
  icon: Icon,
  timezone,
  description,
  onToggleDisplay
}: {
  display: boolean;
  businessName: string;
  logoUrl: string | null;
  icon: LucideIcon;
  timezone: string;
  description: ReactNode;
  onToggleDisplay: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      {display ? (
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div>
            <p className="font-display text-2xl font-semibold leading-tight">{businessName}</p>
            <p className="text-sm text-muted-foreground">Atención en sitio</p>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-semibold">Atención en sitio</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-success">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          En vivo
        </span>
        <LiveClock timezone={timezone} large={display} />
        <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" onClick={onToggleDisplay}>
          {display ? (
            <>
              <X className="h-4 w-4" /> Salir
            </>
          ) : (
            <>
              <Monitor className="h-4 w-4" /> Modo pantalla
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export interface BoardStat {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone: "primary" | "secondary" | "success" | "muted";
}

const TONE: Record<BoardStat["tone"], string> = {
  primary: "border-primary/30 bg-primary/5 text-primary",
  secondary: "border-secondary/40 bg-secondary/10 text-secondary",
  success: "border-success/40 bg-success/10 text-success",
  muted: "border-border bg-card text-muted-foreground"
};

/** Indicadores grandes del día, como en una pantalla de turnos. */
export function WalkInStatTiles({ stats, display }: { stats: BoardStat[]; display: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className={cn("flex items-center gap-3 rounded-xl border p-4", TONE[s.tone])}>
          <s.icon className={cn("shrink-0", display ? "h-7 w-7" : "h-5 w-5")} />
          <div>
            <p className={cn("font-display font-semibold leading-none text-foreground", display ? "text-4xl" : "text-2xl")}>{s.value}</p>
            <p className={cn("mt-1 text-muted-foreground", display ? "text-sm" : "text-xs")}>{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const DOT: Record<"primary" | "secondary" | "success", string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  success: "bg-success"
};

/** Sección del tablero con su grilla de tarjetas. */
export function WalkInBoardSection({
  title,
  count,
  tone,
  hint,
  empty,
  display,
  children
}: {
  title: string;
  count: number;
  tone: "primary" | "secondary" | "success";
  hint?: string;
  empty: string;
  display: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className={cn("flex items-center gap-2 font-display font-semibold", display ? "text-xl" : "text-lg")}>
        <span className={cn("h-2.5 w-2.5 rounded-full", DOT[tone])} aria-hidden="true" />
        {title}
        <span className="text-sm font-normal text-muted-foreground">
          ({count}){hint ? ` · ${hint}` : ""}
        </span>
      </h2>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className={cn("grid gap-4 sm:grid-cols-2", display ? "lg:grid-cols-3 2xl:grid-cols-4" : "xl:grid-cols-3")}>{children}</div>
      )}
    </section>
  );
}

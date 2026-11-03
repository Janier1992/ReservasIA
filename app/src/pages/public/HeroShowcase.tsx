import { BellRing, CalendarCheck, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentChatDemo } from "./AgentChatDemo";

/**
 * Lo que se ve al lado del título: la conversación animada del agente, con
 * avisos que van apareciendo alrededor (lo que el negocio recibe mientras el
 * agente atiende) y manchas de color que se mueven de fondo. Todo con CSS:
 * nada de video, carga al instante.
 */

/**
 * Video de fondo opcional (por ejemplo, generado en Higgsfield), servido desde
 * app/public. null = sin video. Ej.: "/landing/hero.mp4".
 */
export const HERO_VIDEO_SRC: string | null = null;

interface FloatingNotice {
  icon: LucideIcon;
  title: string;
  detail: string;
  /** Posición alrededor del teléfono (solo en pantallas medianas en adelante). */
  position: string;
  delay: string;
}

// Fuera del área de los mensajes: arriba a la izquierda y abajo a la derecha del teléfono.
const NOTICES: FloatingNotice[] = [
  { icon: CalendarCheck, title: "Nueva reserva", detail: "Corte · mañana 10:00 a. m.", position: "-left-4 -top-10 lg:-left-20", delay: "0s" },
  { icon: BellRing, title: "Recordatorio enviado", detail: "Laura · cita a las 3:00 p. m.", position: "-bottom-8 -right-4 lg:-right-16", delay: "2s" }
];

export function HeroShowcase({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-full max-w-md py-6", className)}>
      {/* Manchas de color de fondo */}
      <div aria-hidden className="pointer-events-none absolute -inset-10 -z-10 overflow-hidden">
        <div className="absolute left-0 top-0 h-64 w-64 animate-blob rounded-full bg-primary/25 blur-3xl motion-reduce:animate-none" />
        <div
          className="absolute bottom-0 right-0 h-72 w-72 animate-blob rounded-full bg-secondary/25 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "-6s" }}
        />
      </div>

      {HERO_VIDEO_SRC && (
        <video
          aria-hidden
          className="absolute inset-0 -z-10 h-full w-full rounded-[2rem] object-cover opacity-40"
          src={HERO_VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      )}

      <div className="animate-float motion-reduce:animate-none">
        <AgentChatDemo />
      </div>

      {NOTICES.map(({ icon: Icon, title, detail, position, delay }) => (
        <div
          key={title}
          aria-hidden
          className={cn(
            "absolute hidden animate-toast-in items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:flex motion-reduce:animate-none",
            position
          )}
          style={{ animationDelay: delay, animationDuration: "7.8s" }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-left">
            <span className="block text-sm font-medium leading-tight">{title}</span>
            <span className="block text-xs text-muted-foreground">{detail}</span>
          </span>
        </div>
      ))}

      <div className="absolute right-4 top-2 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg">
        <Zap className="h-3.5 w-3.5" /> Responde al instante
      </div>
    </div>
  );
}

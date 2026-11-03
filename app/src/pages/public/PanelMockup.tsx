import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Home,
  MessageSquare,
  Package,
  Sparkles,
  Users,
  Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vista de ejemplo del panel de ReservasIA para la portada: el menú con los
 * módulos (se va resaltando uno tras otro), indicadores del día y la agenda.
 * Es una ilustración hecha con la propia página, no una captura: los números
 * son de ejemplo y así lo dice la etiqueta.
 */

const MENU = [
  { icon: Home, label: "Inicio" },
  { icon: MessageSquare, label: "Conversaciones" },
  { icon: CalendarDays, label: "Reservas" },
  { icon: ClipboardList, label: "Atención en sitio" },
  { icon: Package, label: "Carta y servicios" },
  { icon: Users, label: "Clientes" },
  { icon: Wallet, label: "Caja" },
  { icon: BarChart3, label: "Reportes" },
  { icon: Sparkles, label: "Agente IA" }
];

const KPIS = [
  { label: "Reservas hoy", value: "18" },
  { label: "En espera", value: "3" },
  { label: "Cobrado hoy", value: "$642.000" }
];

const AGENDA = [
  { time: "9:00 a. m.", who: "Laura G.", what: "Corte y barba", tag: "WhatsApp" },
  { time: "10:30 a. m.", who: "Andrés P.", what: "Corte clásico", tag: "QR" },
  { time: "11:15 a. m.", who: "Camila R.", what: "Arreglo de barba", tag: "Telegram" }
];

const BARS = [38, 62, 45, 80, 56, 92, 70];

export function PanelMockup({ className }: { className?: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setActive((current) => (current + 1) % MENU.length), 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border border-white/10 bg-[#1b1512]/90 text-left text-white shadow-2xl backdrop-blur", className)}
      role="img"
      aria-label="Vista de ejemplo del panel de ReservasIA: menú de módulos, indicadores del día y agenda"
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-3 text-[11px] text-white/40">Panel de tu negocio · vista de ejemplo</span>
      </div>
      <div className="flex">
        <ul className="hidden w-44 shrink-0 space-y-0.5 border-r border-white/10 p-2.5 sm:block">
          {MENU.map(({ icon: Icon, label }, index) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-500",
                index === active ? "bg-primary text-primary-foreground" : "text-white/55"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="grid grid-cols-3 gap-2">
            {KPIS.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                <p className="text-[10px] text-white/45">{kpi.label}</p>
                <p className="mt-0.5 font-display text-base font-semibold sm:text-lg">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] text-white/45">Atenciones de la semana</p>
            <div className="mt-2 flex h-16 items-end gap-1.5">
              {BARS.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 origin-bottom animate-bar-grow rounded-t bg-gradient-to-t from-primary/60 to-primary motion-reduce:animate-none"
                  style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }}
                />
              ))}
            </div>
          </div>
          <ul className="space-y-1.5">
            {AGENDA.map((item) => (
              <li key={item.time} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
                <span className="w-16 shrink-0 font-medium text-white/80">{item.time}</span>
                <span className="min-w-0 flex-1 truncate text-white/60">
                  {item.who} · {item.what}
                </span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary-foreground/90">{item.tag}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

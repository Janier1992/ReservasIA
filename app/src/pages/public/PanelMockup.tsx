import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Home,
  MessageSquare,
  Package,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vista de ejemplo del panel de ReservasIA para la portada. Cada módulo del
 * menú tiene su propia pantalla; pasan solas una tras otra y también se
 * pueden tocar (al tocar, la rotación se pausa un rato). Es una ilustración
 * hecha con la propia página, no una captura: los datos son de ejemplo y así
 * lo dice la barra superior.
 */

const AUTO_MS = 3200;
/** Después de que el visitante elige un módulo, se espera esto antes de seguir rotando solo. */
const RESUME_AFTER_CLICK_MS = 12000;

const cop = (value: number) => `$${value.toLocaleString("es-CO")}`;

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-white/10 bg-white/[0.04] p-3", className)}>{children}</div>;
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[10px] uppercase tracking-wide text-white/45">{children}</p>;
}

function Pill({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "muted" | "ok" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px]",
        tone === "primary" && "bg-primary/25 text-white",
        tone === "muted" && "bg-white/10 text-white/60",
        tone === "ok" && "bg-emerald-500/20 text-emerald-200"
      )}
    >
      {children}
    </span>
  );
}

function Row({ left, middle, right }: { left: ReactNode; middle: ReactNode; right?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
      <span className="w-16 shrink-0 font-medium text-white/85">{left}</span>
      <span className="min-w-0 flex-1 truncate text-white/60">{middle}</span>
      {right}
    </li>
  );
}

function Bars({ values }: { values: number[] }) {
  return (
    <div className="mt-2 flex h-20 items-end gap-1.5">
      {values.map((height, index) => (
        <span
          key={index}
          className="flex-1 origin-bottom animate-bar-grow rounded-t bg-gradient-to-t from-primary/50 to-primary motion-reduce:animate-none"
          style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }}
        />
      ))}
    </div>
  );
}

/* ---------- Pantallas de cada módulo ---------- */

function HomeView() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Reservas hoy", "18"],
          ["En espera", "3"],
          ["Cobrado hoy", cop(642000)]
        ].map(([label, value]) => (
          <Card key={label}>
            <Label>{label}</Label>
            <p className="mt-1 font-display text-lg font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <Label>Atenciones de la semana</Label>
        <Bars values={[38, 62, 45, 80, 56, 92, 70]} />
      </Card>
    </div>
  );
}

function InboxView() {
  const chats = [
    { name: "Laura Gómez", text: "Listo ✅ Te agendé un corte mañana a las 10:00 a. m.", channel: "WhatsApp", ai: true },
    { name: "Andrés Pérez", text: "¿Cuánto vale el corte con barba?", channel: "Telegram", ai: true },
    { name: "Camila Ríos", text: "Gracias, ahí estaré 🙌", channel: "WhatsApp", ai: false }
  ];
  return (
    <ul className="space-y-2">
      {chats.map((chat) => (
        <li key={chat.name} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/30 text-xs font-semibold">
            {chat.name[0]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-medium">
              {chat.name} <Pill tone="muted">{chat.channel}</Pill>
              {chat.ai && <Pill>Respondió la IA</Pill>}
            </span>
            <span className="mt-1 block truncate text-xs text-white/60">{chat.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReservationsView() {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, index) => (
          <span
            key={day}
            className={cn("flex-1 rounded-lg py-1.5 text-center text-[10px]", index === 4 ? "bg-primary text-white" : "bg-white/[0.06] text-white/55")}
          >
            {day}
          </span>
        ))}
      </div>
      <ul className="space-y-1.5">
        <Row left="9:00 a. m." middle="Laura G. · Corte y barba · Silla 1" right={<Pill>WhatsApp</Pill>} />
        <Row left="10:30 a. m." middle="Andrés P. · Corte clásico · Silla 2" right={<Pill>QR</Pill>} />
        <Row left="11:15 a. m." middle="Camila R. · Arreglo de barba · Silla 1" right={<Pill>Telegram</Pill>} />
        <Row left="1:00 p. m." middle="Almuerzo · todo el negocio" right={<Pill tone="muted">Bloqueo</Pill>} />
      </ul>
    </div>
  );
}

function WalkInsView() {
  const columns = [
    { title: "En espera", items: [["#012", "Lavado básico · ABC123"], ["#013", "Polichado · XYZ789"]] },
    { title: "En atención", items: [["#010", "Lavado full · Bahía 1"], ["#011", "Lavado motor · Bahía 2"]] },
    { title: "Listos", items: [["#009", "Lavado básico · avisado ✅"]] }
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {columns.map((column) => (
        <div key={column.title} className="space-y-1.5">
          <Label>{column.title}</Label>
          {column.items.map(([ticket, text]) => (
            <Card key={ticket} className="p-2">
              <p className="font-display text-base font-semibold">{ticket}</p>
              <p className="truncate text-[10px] text-white/55">{text}</p>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function CatalogView() {
  const items: [string, number, boolean][] = [
    ["Bandeja paisa", 32000, true],
    ["Ajiaco santafereño", 28000, true],
    ["Limonada de coco", 9000, false],
    ["Postre de natas", 8500, true]
  ];
  return (
    <ul className="space-y-1.5">
      {items.map(([name, price, available]) => (
        <li key={name} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-white/85">{name}</span>
          <span className="w-16 text-right text-white/70">{cop(price)}</span>
          <Pill tone={available ? "ok" : "muted"}>{available ? "Disponible" : "Agotado hoy"}</Pill>
        </li>
      ))}
      <li className="pt-1 text-center text-[10px] text-white/45">Tus clientes piden escaneando el QR de la mesa</li>
    </ul>
  );
}

function CustomersView() {
  const customers: [string, string, string][] = [
    ["Laura Gómez", "12 visitas", "Le gusta el corte bajo a los lados"],
    ["Andrés Pérez", "5 visitas", "Plan: 10 cortes · 7 de 10 sellos"],
    ["Camila Ríos", "1 visita", "Vino por la página de reservas"]
  ];
  return (
    <ul className="space-y-2">
      {customers.map(([name, visits, note]) => (
        <li key={name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/30 text-xs font-semibold">{name[0]}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium">{name}</span>
            <span className="block truncate text-[11px] text-white/55">{note}</span>
          </span>
          <Pill tone="muted">{visits}</Pill>
        </li>
      ))}
    </ul>
  );
}

function CashView() {
  const methods: [string, number][] = [
    ["Efectivo", 214000],
    ["Nequi", 268000],
    ["Tarjeta", 160000]
  ];
  const total = methods.reduce((sum, [, value]) => sum + value, 0);
  return (
    <div className="space-y-3">
      <Card>
        <Label>Cierre de caja de hoy</Label>
        <p className="mt-1 font-display text-2xl font-semibold">{cop(total)}</p>
      </Card>
      <ul className="space-y-1.5">
        {methods.map(([method, value]) => (
          <li key={method} className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-white/70">{method}</span>
              <span className="font-medium">{cop(value)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full origin-left animate-bar-grow-x rounded-full bg-primary motion-reduce:animate-none" style={{ width: `${(value / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportsView() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Ingresos 30 días", cop(14_380_000)],
          ["Ticket promedio", cop(41_000)],
          ["No-show", "3 %"]
        ].map(([label, value]) => (
          <Card key={label}>
            <Label>{label}</Label>
            <p className="mt-1 font-display text-sm font-semibold sm:text-base">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <Label>Reservas por día</Label>
        <Bars values={[55, 72, 48, 66, 84, 100, 40]} />
      </Card>
    </div>
  );
}

function AgentView() {
  const messages: [string, boolean][] = [
    ["Hola, ¿tienen cupo mañana para un corte?", false],
    ["¡Hola! Mañana tengo libre a las 10:00 a. m. y a las 3:00 p. m. ¿Cuál te sirve?", true],
    ["A las 10 porfa", false],
    ["Listo ✅ Te agendé. Te recuerdo por acá antes de la cita.", true]
  ];
  return (
    <div className="space-y-1.5">
      {messages.map(([text, fromAgent], index) => (
        <p
          key={index}
          className={cn(
            "max-w-[85%] animate-message-in rounded-2xl px-3 py-1.5 text-xs motion-reduce:animate-none",
            fromAgent ? "rounded-bl-sm bg-white/10 text-white/85" : "ml-auto rounded-br-sm bg-primary text-white"
          )}
          style={{ animationDelay: `${index * 350}ms`, animationFillMode: "both" }}
        >
          {text}
        </p>
      ))}
    </div>
  );
}

const MODULES: { icon: LucideIcon; label: string; title: string; view: () => JSX.Element }[] = [
  { icon: Home, label: "Inicio", title: "Tu día de un vistazo", view: HomeView },
  { icon: MessageSquare, label: "Conversaciones", title: "WhatsApp y Telegram en un solo lugar", view: InboxView },
  { icon: CalendarDays, label: "Reservas", title: "Agenda por recurso, con bloqueos", view: ReservationsView },
  { icon: ClipboardList, label: "Atención en sitio", title: "Fila, tickets y tablero del local", view: WalkInsView },
  { icon: Package, label: "Carta y servicios", title: "Catálogo con precios, menú del día y agotados", view: CatalogView },
  { icon: Users, label: "Clientes", title: "Historial, fichas y planes de cada cliente", view: CustomersView },
  { icon: Wallet, label: "Caja", title: "Cobros por medio de pago y cierre del día", view: CashView },
  { icon: BarChart3, label: "Reportes", title: "Ingresos, ticket promedio y no-show", view: ReportsView },
  { icon: Sparkles, label: "Agente IA", title: "Responde y agenda las 24 horas", view: AgentView }
];

export function PanelMockup({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setActive((current) => (current + 1) % MODULES.length);
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, []);

  function choose(index: number) {
    pausedUntil.current = Date.now() + RESUME_AFTER_CLICK_MS;
    setActive(index);
  }

  const current = MODULES[active];
  const View = current.view;

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border border-white/10 bg-[#1b1512]/90 text-left text-white shadow-2xl backdrop-blur", className)}
      role="region"
      aria-label="Vista de ejemplo del panel de ReservasIA"
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-3 truncate text-[11px] text-white/40">Panel de tu negocio · vista de ejemplo · tocá un módulo</span>
      </div>

      {/* En el celular el menú va arriba, en una fila que se desliza */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 p-2 sm:hidden">
        {MODULES.map(({ icon: Icon, label }, index) => (
          <button
            key={label}
            type="button"
            onClick={() => choose(index)}
            aria-pressed={index === active}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors",
              index === active ? "bg-primary text-primary-foreground" : "bg-white/[0.06] text-white/60"
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="flex">
        <ul className="hidden w-48 shrink-0 space-y-0.5 border-r border-white/10 p-2.5 sm:block">
          {MODULES.map(({ icon: Icon, label }, index) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => choose(index)}
                aria-pressed={index === active}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-300",
                  index === active ? "bg-primary text-primary-foreground" : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            </li>
          ))}
        </ul>
        <div className="min-h-[19rem] min-w-0 flex-1 p-4">
          <div key={active} className="animate-message-in motion-reduce:animate-none">
            <p className="mb-3 text-sm font-medium">{current.title}</p>
            <View />
          </div>
          <div className="mt-4 flex gap-1" aria-hidden>
            {MODULES.map((module, index) => (
              <span key={module.label} className={cn("h-1 flex-1 rounded-full", index === active ? "bg-primary" : "bg-white/10")} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardList,
  Gift,
  KanbanSquare,
  Mail,
  MessageCircle,
  Package,
  Sparkles,
  Star,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { LegalLinks } from "@/pages/legal/LegalLayout";
import { cn } from "@/lib/utils";
import { AgentChatDemo } from "./AgentChatDemo";
import { PanelMockup } from "./PanelMockup";
import { Reveal } from "./Reveal";

/**
 * Página de presentación pública (la dirección principal del sitio): es lo que
 * encuentra quien busca "ReservasIA" en Google. Quien ya inició sesión va
 * directo a su panel. Todo lo que dice tiene que ser cierto del producto: no
 * se prometen funciones que no existen ni se inventan cifras o testimonios
 * (los números del panel de ejemplo están rotulados como ejemplo).
 */

/** Días de prueba gratis al registrarse (igual que public.signup_trial_days() en la base). */
const TRIAL_DAYS = 14;

/** Precios en pesos colombianos. */
const ACTIVATION_PRICE_COP = 850_000;
const MONTHLY_PRICE_COP = 150_000;

/**
 * Video de fondo opcional para la portada (por ejemplo, generado en
 * Higgsfield), servido desde app/public. null = sin video. Ej.: "/landing/hero.mp4".
 */
const HERO_VIDEO_SRC: string | null = null;

const SECTORS = [
  "Barberías",
  "Peluquerías",
  "Spas y estética",
  "Consultorios odontológicos",
  "Clínicas",
  "Fisioterapia",
  "Veterinarias",
  "Talleres mecánicos",
  "Lavaderos de vehículos",
  "Restaurantes",
  "Academias",
  "Gimnasios",
  "Estudios"
];

const MODULES: { icon: typeof Sparkles; title: string; text: string; featured?: boolean }[] = [
  {
    icon: Sparkles,
    title: "Agente con IA",
    text: "Atiende por WhatsApp y Telegram las 24 horas: responde, consulta tu disponibilidad real y crea, cambia o cancela reservas.",
    featured: true
  },
  {
    icon: CalendarDays,
    title: "Reservas y agenda",
    text: "Agenda por recurso, horarios propios, bloqueos, página de reservas con QR y sincronización con Google Calendar.",
    featured: true
  },
  {
    icon: Package,
    title: "Carta, productos y pedidos por QR",
    text: "Catálogo de productos y servicios con precios, menú del día y agotados. Tus clientes piden escaneando el QR.",
    featured: true
  },
  { icon: ClipboardList, title: "Atención en sitio", text: "Fila de llegadas, tickets numerados y tablero en pantalla para tu local." },
  { icon: Wallet, title: "Caja", text: "Cobros por medio de pago (efectivo, Nequi, tarjeta…) y cierre del día." },
  { icon: BarChart3, title: "Reportes", text: "Ingresos, ticket promedio, cancelaciones y no-show, exportables a CSV." },
  { icon: Users, title: "Clientes y fichas", text: "Historial de cada cliente y fichas según tu rubro: vehículos, mascotas o preferencias." },
  { icon: Gift, title: "Planes y fidelización", text: "Bonos de sesiones, membresías y tarjetas de sellos que se descuentan solas." },
  { icon: KanbanSquare, title: "Etapas de atención", text: "Tablero por etapas (recibido, en reparación, listo) con aviso al cliente." },
  { icon: Star, title: "Opiniones", text: "Encuestas de satisfacción e invitación a dejar la reseña en Google." },
  { icon: UserPlus, title: "Recuperar clientes", text: "Detecta quién dejó de venir y escribile en un toque." },
  { icon: BellRing, title: "Recordatorios", text: "Antes de cada cita, por el mismo chat por donde reservaron." }
];

const AGENT_POINTS = [
  "Agenda en tus horarios reales, por servicio y por persona",
  "Confirma por chat y por correo, y recuerda la cita",
  "Atiende en tu mismo número de WhatsApp Business",
  "Si respondés vos, se pausa para no pisarte"
];

const FAQS = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: `No. Creás tu cuenta y usás ReservasIA completo durante ${TRIAL_DAYS} días sin poner ningún medio de pago.`
  },
  {
    q: "¿Qué pasa cuando termina la prueba?",
    a: "Si querés seguir, pagás la activación (una sola vez) y desde ahí la mensualidad. Si no, tu cuenta queda en pausa: no se cobra nada automáticamente."
  },
  {
    q: "¿Cómo se paga?",
    a: "Desde el panel: pagás por Nequi y subís la captura del comprobante. Apenas se confirma, tu servicio queda activo."
  },
  {
    q: "¿Funciona con mi número de WhatsApp?",
    a: "Sí. El agente atiende en tu mismo número de WhatsApp Business y vos seguís usando la app en tu celular. También funciona con Telegram."
  },
  {
    q: "¿Y si necesito ayuda o algo a la medida?",
    a: "El soporte personalizado y las mejoras a la medida de tu negocio se cobran con una tarifa fija por hora."
  }
];

const formatCop = (value: number) => `$${value.toLocaleString("es-CO")}`;

/** Botón fijo abajo en el celular, después de pasar la portada: el llamado a la acción siempre a mano. */
function MobileStickyCta() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur transition-transform duration-300 sm:hidden",
        visible ? "translate-y-0" : "translate-y-full"
      )}
      aria-hidden={!visible}
    >
      <Link to="/register" tabIndex={visible ? 0 : -1} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        Empezar gratis
      </Link>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Portada oscura: siempre igual, en tema claro u oscuro */}
      <section className="relative isolate overflow-hidden bg-[#120c0a] text-white">
        {HERO_VIDEO_SRC && (
          <video
            aria-hidden
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-30"
            src={HERO_VIDEO_SRC}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] animate-blob rounded-full bg-primary/40 blur-[120px] motion-reduce:animate-none" />
          <div
            className="absolute -right-40 top-40 h-[28rem] w-[28rem] animate-blob rounded-full bg-orange-500/25 blur-[120px] motion-reduce:animate-none"
            style={{ animationDelay: "-7s" }}
          />
        </div>

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarClock className="h-4 w-4" />
            </span>
            ReservasIA
          </Link>
          <nav className="flex items-center gap-1">
            <ThemeToggle className="text-white hover:bg-white/10" />
            <a href="#precios" className="hidden rounded-md px-3 py-1.5 text-sm text-white/75 hover:text-white sm:inline">
              Precios
            </a>
            <Link to="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-white hover:bg-white/10")}>
              Ingresar
            </Link>
          </nav>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 text-center sm:pt-16">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Inteligencia artificial + gestión completa para tu negocio
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Tu negocio entero, en{" "}
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-300 bg-clip-text text-transparent">piloto automático</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
            Un agente con IA atiende a tus clientes por WhatsApp y Telegram las 24 horas, y vos manejás reservas, ventas, caja,
            catálogo, clientes y reportes desde una sola app hecha para tu rubro.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className={cn(buttonVariants({ size: "lg" }), "w-full shadow-[0_0_40px_-8px] shadow-primary sm:w-auto")}
            >
              Probar gratis {TRIAL_DAYS} días <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#precios"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full border-white/20 text-white hover:bg-white/10 sm:w-auto")}
            >
              Ver precios
            </a>
          </div>
          <div className="mt-4 flex flex-col items-center gap-2 text-xs text-white/55">
            <span>Sin tarjeta de crédito · Usala en el navegador o instalala en tu celular</span>
            <InstallAppButton className="border-white/20 bg-transparent text-white hover:bg-white/10" />
          </div>

          <div className="relative mx-auto mt-16 max-w-5xl [perspective:2000px]">
            <div aria-hidden className="absolute inset-x-10 -bottom-6 h-24 rounded-full bg-primary/40 blur-3xl" />
            <PanelMockup className="relative mx-auto [transform:rotateX(8deg)] motion-reduce:[transform:none]" />
          </div>
        </div>
      </section>

      {/* Rubros */}
      <section className="border-b border-border py-8">
        <p className="mb-5 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Hecho para cada rubro</p>
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <ul className="flex w-max animate-marquee gap-3 motion-reduce:animate-none" aria-label="Rubros">
            {[...SECTORS, ...SECTORS].map((sector, index) => (
              <li
                key={index}
                aria-hidden={index >= SECTORS.length}
                className="whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm"
              >
                {sector}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main>
        {/* Todo el negocio en una app */}
        <section className="mx-auto w-full max-w-6xl px-4 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">No es solo para reservar</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Todo tu negocio en una sola app</h2>
            <p className="mt-4 text-muted-foreground">
              Un panel completo para gestionar tu negocio, con los módulos que necesita tu rubro. Lo usás en el computador o en
              el celular, con todo tu equipo.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, title, text, featured }, index) => (
              <Reveal key={title} delayMs={(index % 3) * 90}>
                <div
                  className={cn(
                    "group h-full rounded-2xl border p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10",
                    featured ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent" : "border-border bg-card"
                  )}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* El agente */}
        <section className="relative isolate overflow-hidden bg-[#120c0a] text-white">
          <div aria-hidden className="absolute -right-32 top-10 -z-10 h-96 w-96 animate-blob rounded-full bg-primary/30 blur-[110px] motion-reduce:animate-none" />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-24 lg:grid-cols-2">
            <Reveal>
              <p className="text-sm font-medium text-primary">Agente con inteligencia artificial</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Tu mejor recepcionista no duerme</h2>
              <p className="mt-5 text-lg text-white/70">
                Un cliente te escribe a las 11:47 p. m. Sin ReservasIA, mañana ya reservó en otro lado. Con ReservasIA, ya tiene su
                cita agendada, confirmada y con recordatorio. Y vos, durmiendo.
              </p>
              <ul className="mt-8 space-y-3">
                {AGENT_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </span>
                    <span className="text-white/85">{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3 text-xs text-white/60">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1">
                  <MessageCircle className="h-3.5 w-3.5" /> Telegram
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Google Calendar
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1">
                  <Mail className="h-3.5 w-3.5" /> Correo
                </span>
              </div>
            </Reveal>
            <Reveal delayMs={150}>
              <div className="relative">
                <div aria-hidden className="absolute inset-6 -z-10 rounded-[2rem] bg-primary/40 blur-3xl" />
                <div className="animate-float motion-reduce:animate-none">
                  <AgentChatDemo />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Precios */}
        <section id="precios" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">Precios claros</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Empezá gratis. Quedate si te sirve.</h2>
            <p className="mt-4 text-muted-foreground">Precios en pesos colombianos.</p>
          </Reveal>
          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            <Reveal className="h-full">
              <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-7">
                <p className="text-sm font-medium text-muted-foreground">1. Prueba</p>
                <p className="mt-3 font-display text-4xl font-semibold">Gratis</p>
                <p className="text-sm text-muted-foreground">{TRIAL_DAYS} días</p>
                <p className="mt-5 flex-1 text-sm text-muted-foreground">
                  Todo el panel y el agente con IA, con los módulos de tu rubro. Sin tarjeta de crédito.
                </p>
                <Link to="/register" className={cn(buttonVariants({ variant: "outline" }), "mt-6 w-full")}>
                  Empezar mi prueba gratis
                </Link>
              </div>
            </Reveal>
            <Reveal delayMs={100} className="h-full">
              <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-7">
                <p className="text-sm font-medium text-muted-foreground">2. Activación</p>
                <p className="mt-3 font-display text-4xl font-semibold">{formatCop(ACTIVATION_PRICE_COP)}</p>
                <p className="text-sm text-muted-foreground">pago único</p>
                <p className="mt-5 flex-1 text-sm text-muted-foreground">
                  Al terminar la prueba, si querés quedarte. Se paga una sola vez.
                </p>
              </div>
            </Reveal>
            <Reveal delayMs={200} className="h-full">
              <div className="relative flex h-full flex-col rounded-3xl border-2 border-primary bg-card p-7 shadow-2xl shadow-primary/15">
                <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Después
                </span>
                <p className="text-sm font-medium text-primary">3. Mensualidad</p>
                <p className="mt-3 font-display text-4xl font-semibold">{formatCop(MONTHLY_PRICE_COP)}</p>
                <p className="text-sm text-muted-foreground">por mes</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {["Agente con IA en WhatsApp y Telegram", "Panel completo con los módulos de tu rubro", "Página de reservas y pedidos con QR", "Usuarios para todo tu equipo"].map(
                    (item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {item}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </Reveal>
          </div>
          <Reveal className="mt-6 rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            <strong className="text-foreground">Soporte e implementación de mejoras:</strong> el soporte personalizado y las mejoras a
            la medida de tu negocio tienen una tarifa fija por hora.
          </Reveal>
        </section>

        {/* Preguntas frecuentes */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-3xl px-4 py-24">
            <Reveal>
              <h2 className="text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">Preguntas frecuentes</h2>
            </Reveal>
            <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card">
              {FAQS.map(({ q, a }) => (
                <details key={q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {q}
                    <span className="text-primary transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Llamado final */}
        <section className="px-4 pb-24">
          <Reveal className="relative isolate mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] bg-[#120c0a] px-6 py-16 text-center text-white sm:px-12">
            <div aria-hidden className="absolute -left-20 -top-24 -z-10 h-80 w-80 animate-blob rounded-full bg-primary/50 blur-[100px] motion-reduce:animate-none" />
            <div
              aria-hidden
              className="absolute -bottom-24 -right-20 -z-10 h-80 w-80 animate-blob rounded-full bg-orange-500/30 blur-[100px] motion-reduce:animate-none"
              style={{ animationDelay: "-8s" }}
            />
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Tu próxima reserva no debería esperar</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">
              Creá tu cuenta en minutos y probá ReservasIA completo durante {TRIAL_DAYS} días, gratis.
            </p>
            <Link to="/register" className={cn(buttonVariants({ size: "lg" }), "mt-8 shadow-[0_0_40px_-8px] shadow-primary")}>
              Crear mi cuenta gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border px-4 pb-24 pt-8 sm:pb-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ReservasIA</p>
          <LegalLinks />
        </div>
      </footer>

      <MobileStickyCta />
    </div>
  );
}

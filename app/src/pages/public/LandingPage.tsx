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
import { LossCalculator } from "./LossCalculator";
import {
  ACTIVATION_INSTALLMENTS,
  ACTIVATION_INSTALLMENT_COP,
  ACTIVATION_PRICE_COP,
  ANNUAL_FREE_MONTHS,
  ANNUAL_MONTHLY_EQUIVALENT_COP,
  ANNUAL_PRICE_COP,
  MONTHLY_PRICE_COP,
  TRIAL_DAYS,
  VAT_PERCENT_LABEL,
  formatCop
} from "@/lib/pricing";

/**
 * Página de presentación pública (la dirección principal del sitio): es lo que
 * encuentra quien busca "ReservasIA" en Google. Quien ya inició sesión va
 * directo a su panel. Todo lo que dice tiene que ser cierto del producto: no
 * se prometen funciones que no existen ni se inventan cifras o testimonios
 * (los números del panel de ejemplo están rotulados como ejemplo).
 */

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

/** Los pasos para dejar el negocio funcionando. */
const START_STEPS = [
  { title: "Creá tu cuenta", text: "Con tu correo, en un minuto. Elegís tu tipo de negocio y empezás la prueba gratis, sin tarjeta." },
  {
    title: "Cargá tus servicios y horarios",
    text: "Tu carta o tus servicios con precios, y cuándo atendés. El agente responde con esa información."
  },
  {
    title: "Conectá WhatsApp o Telegram",
    text: "Desde el panel. A partir de ahí el agente contesta, agenda y te avisa de cada reserva."
  }
];

/** Lo que incluyen los dos planes (todo tiene que existir en el producto). */
const PLAN_INCLUDES = [
  "Agente con IA en WhatsApp y Telegram, las 24 horas",
  "Panel completo con los módulos de tu rubro",
  "Página de reservas y pedidos con QR",
  "Recordatorios automáticos a tus clientes",
  "Usuarios para todo tu equipo",
  "Actualizaciones y arreglo de fallas"
];

/** Lo que suele dar miedo de un software por suscripción, dicho de frente. */
const NO_SURPRISES = [
  { title: "Sin cobros automáticos", text: "Cada pago lo hacés vos desde el panel. Si no pagás, la cuenta queda en pausa con tus datos guardados." },
  {
    title: "WhatsApp, en tu cuenta",
    text: "Lo que Meta y YCloud cobren por los mensajes se paga en tu cuenta de YCloud. Telegram no tiene costo."
  },
  {
    title: "Mejoras a la medida",
    text: "El soporte personalizado y los desarrollos especiales van con tarifa fija por hora, con cotización antes."
  }
];

const FAQS = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: `No. Creás tu cuenta y usás ReservasIA completo durante ${TRIAL_DAYS} días sin poner ningún medio de pago.`
  },
  {
    q: "¿Qué pasa cuando termina la prueba?",
    a: "Elegís el plan mensual o el anual. Si no elegís ninguno, tu cuenta queda en pausa con tus datos guardados: nunca se cobra nada automáticamente."
  },
  {
    q: "¿Para qué es la activación y puedo pagarla en cuotas?",
    a: `Es un pago único del plan mensual para la puesta en marcha: cargar tus servicios o tu carta y tus horarios, conectar WhatsApp o Telegram y dejar el agente respondiendo como tu negocio. Podés pagarla de una vez (${formatCop(ACTIVATION_PRICE_COP)}) o en ${ACTIVATION_INSTALLMENTS} cuotas de ${formatCop(ACTIVATION_INSTALLMENT_COP)} junto con las primeras mensualidades. En el plan anual no se cobra. Todos los valores son más IVA (${VAT_PERCENT_LABEL}).`
  },
  {
    q: "¿Tengo que firmar permanencia?",
    a: "No. El plan mensual se paga mes a mes y lo podés dejar cuando quieras. No hay cobros automáticos: cada pago lo hacés vos."
  },
  {
    q: "¿Cómo se paga?",
    a: "Desde el panel, en Configuración → Suscripción: elegís qué vas a pagar y el panel te muestra el total con IVA; pagás por Nequi y subís la captura del comprobante. Apenas se confirma, tu servicio queda activo y te llega un correo."
  },
  {
    q: "¿Los mensajes de WhatsApp tienen un costo aparte?",
    a: "Telegram no tiene costo. WhatsApp funciona con tu propia cuenta de YCloud: lo que Meta y YCloud cobren por los mensajes se paga directamente en esa cuenta, según sus tarifas. ReservasIA no le suma nada."
  },
  {
    q: "¿Funciona con mi número de WhatsApp?",
    a: "Sí. El agente atiende en tu mismo número de WhatsApp Business y vos seguís usando la app en tu celular. También funciona con Telegram."
  },
  {
    q: "¿Qué incluye la mensualidad y qué se cobra aparte?",
    a: "La mensualidad incluye todas las funciones, las actualizaciones y el arreglo de cualquier falla de la app. Aparte, con una tarifa fija por hora, va el soporte personalizado (capacitaciones extra o configuraciones especiales) y las mejoras hechas a la medida de tu negocio: siempre te pasamos la cotización antes y solo pagás si la aprobás."
  }
];

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

        {/* Cómo empezar */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">Cómo empezás</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Funcionando en 3 pasos.</h2>
            <p className="mt-4 text-muted-foreground">Sin instalar nada raro ni saber de tecnología.</p>
          </Reveal>
          <ol className="mt-14 grid gap-4 md:grid-cols-3">
            {START_STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delayMs={index * 100} className="h-full">
                  <div className="h-full rounded-3xl border border-border bg-card p-7">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-lg font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <p className="mt-5 font-display text-lg font-semibold">{step.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Calculadora */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">Hacé la cuenta</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              ¿Cuánto te cuesta no contestar a tiempo?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Cada mensaje que queda sin respuesta es un cliente que le escribe a otro negocio.
            </p>
          </Reveal>
          <Reveal className="mt-14">
            <LossCalculator />
          </Reveal>
        </section>

        {/* Precios */}
        <section id="precios" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">Precios claros</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Un precio simple, sin letra pequeña.</h2>
            <p className="mt-4 text-muted-foreground">
              Probás gratis {TRIAL_DAYS} días y después elegís cómo pagar. Precios en pesos colombianos, más IVA ({VAT_PERCENT_LABEL}).
            </p>
          </Reveal>

          <Reveal className="mx-auto mt-12 max-w-4xl">
            <div className="flex flex-col items-start gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Gift className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold">{TRIAL_DAYS} días gratis, con todo incluido</p>
                  <p className="text-sm text-muted-foreground">Sin tarjeta de crédito. Si no seguís, no pagás nada.</p>
                </div>
              </div>
              <Link to="/register" className={cn(buttonVariants(), "w-full shrink-0 sm:w-auto")}>
                Empezar mi prueba gratis
              </Link>
            </div>
          </Reveal>

          <div className="mx-auto mt-6 grid max-w-4xl gap-4 md:grid-cols-2">
            <Reveal className="h-full">
              <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-7">
                <p className="text-sm font-medium text-muted-foreground">Plan mensual</p>
                <p className="mt-3 font-display text-4xl font-semibold">
                  {formatCop(MONTHLY_PRICE_COP)}
                  <span className="text-base font-normal text-muted-foreground"> + IVA /mes</span>
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Más una activación de {formatCop(ACTIVATION_PRICE_COP)} + IVA, una sola vez. Podés pagarla en {ACTIVATION_INSTALLMENTS} cuotas
                  de {formatCop(ACTIVATION_INSTALLMENT_COP)} junto con tus primeras mensualidades.
                </p>
                <dl className="mt-5 flex-1 space-y-2 rounded-2xl bg-muted/60 p-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Meses 1 a {ACTIVATION_INSTALLMENTS}</dt>
                    <dd className="font-medium">{formatCop(MONTHLY_PRICE_COP + ACTIVATION_INSTALLMENT_COP)} + IVA</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Desde el mes {ACTIVATION_INSTALLMENTS + 1}</dt>
                    <dd className="font-medium">{formatCop(MONTHLY_PRICE_COP)} + IVA</dd>
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">Sin permanencia: lo dejás cuando quieras.</p>
                </dl>
                <Link to="/register" className={cn(buttonVariants({ variant: "outline" }), "mt-6 w-full")}>
                  Probar gratis
                </Link>
              </div>
            </Reveal>
            <Reveal delayMs={100} className="h-full">
              <div className="relative flex h-full flex-col rounded-3xl border-2 border-primary bg-card p-7 shadow-2xl shadow-primary/15">
                <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Más conveniente · {ANNUAL_FREE_MONTHS} meses gratis
                </span>
                <p className="text-sm font-medium text-primary">Plan anual</p>
                <p className="mt-3 font-display text-4xl font-semibold">
                  {formatCop(ANNUAL_PRICE_COP)}
                  <span className="text-base font-normal text-muted-foreground"> + IVA /año</span>
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Equivale a {formatCop(ANNUAL_MONTHLY_EQUIVALENT_COP)} + IVA al mes. <strong className="text-foreground">Sin activación.</strong>
                </p>
                <dl className="mt-5 flex-1 space-y-2 rounded-2xl bg-primary/5 p-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Un solo pago</dt>
                    <dd className="font-medium">12 meses de servicio</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Ahorrás el primer año</dt>
                    <dd className="font-medium">
                      {formatCop(MONTHLY_PRICE_COP * 12 + ACTIVATION_PRICE_COP - ANNUAL_PRICE_COP)}
                    </dd>
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">Incluye la puesta en marcha sin costo.</p>
                </dl>
                <Link to="/register" className={cn(buttonVariants(), "mt-6 w-full")}>
                  Probar gratis
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal className="mx-auto mt-6 max-w-4xl rounded-3xl border border-border bg-card p-7">
            <p className="font-display text-lg font-semibold">Los dos planes incluyen todo</p>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {PLAN_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="mx-auto mt-6 grid max-w-4xl gap-3 text-sm sm:grid-cols-3">
            {NO_SURPRISES.map((item) => (
              <div key={item.title} className="rounded-2xl border border-dashed border-border p-5">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-muted-foreground">{item.text}</p>
              </div>
            ))}
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

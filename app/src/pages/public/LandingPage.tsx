import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { BellRing, CalendarClock, CalendarDays, Check, Inbox, MessageCircle, Moon, QrCode, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { LegalLinks } from "@/pages/legal/LegalLayout";
import { cn } from "@/lib/utils";
import { HeroShowcase } from "./HeroShowcase";
import { Reveal } from "./Reveal";

/**
 * Página de presentación pública (la dirección principal del sitio): es lo que
 * encuentra quien busca "ReservasIA" en Google. Quien ya inició sesión va
 * directo a su panel. Todo lo que dice tiene que ser cierto del producto: no
 * se prometen funciones que no existen ni se inventan cifras o testimonios.
 */

/** Días de prueba gratis al registrarse (igual que public.signup_trial_days() en la base). */
const TRIAL_DAYS = 14;

/**
 * Precio mensual a mostrar, en pesos colombianos. null = todavía no se publica
 * un precio: solo se muestra la prueba gratis.
 */
const MONTHLY_PRICE_COP: number | null = null;

const WITHOUT = [
  "Mensajes que esperan horas mientras atendés",
  "Clientes que reservan en otro lado porque nadie contestó",
  "Citas olvidadas y horarios vacíos",
  "El celular sonando todo el día"
];

const WITH = [
  "Respuesta al instante, las 24 horas",
  "La reserva queda agendada en tus horarios reales",
  "Recordatorio automático antes de cada cita",
  "Vos atendés; el agente agenda"
];

const FEATURES: { icon: typeof Sparkles; title: string; text: string }[] = [
  { icon: Sparkles, title: "Agenda solo, 24/7", text: "Responde, consulta tu disponibilidad real y crea, cambia o cancela reservas." },
  { icon: MessageCircle, title: "WhatsApp y Telegram", text: "En tu mismo número de WhatsApp Business. Si respondés vos, el agente se pausa." },
  { icon: QrCode, title: "Página de reservas con QR", text: "Tus clientes reservan desde el celular escaneando el QR de tu local." },
  { icon: BellRing, title: "Recordatorios automáticos", text: "Antes de cada cita, por el mismo chat por donde reservaron." },
  { icon: CalendarDays, title: "Google Calendar y correo", text: "Cada reserva llega a tu calendario y el cliente recibe su confirmación." },
  { icon: Inbox, title: "Todo en un panel", text: "Conversaciones, reservas y clientes, desde el celular o el computador." }
];

const STEPS = [
  { title: "Creá tu cuenta", text: "Elegí tu rubro y cargá servicios y horarios." },
  { title: "Conectá tus canales", text: "WhatsApp, Telegram y, si querés, Google Calendar." },
  { title: "Listo", text: "El agente atiende; vos revisás todo desde el panel." }
];

const formatCop = (value: number) => `$${value.toLocaleString("es-CO")}`;

function TrialLink({ className, label = `Probar gratis ${TRIAL_DAYS} días` }: { className?: string; label?: string }) {
  return (
    <Link to="/register" className={cn(buttonVariants({ size: "lg" }), "shadow-lg shadow-primary/25", className)}>
      {label}
    </Link>
  );
}

/** Botón fijo abajo en el celular, después de pasar la portada: el llamado a la acción siempre a mano. */
function MobileStickyCta() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 640);
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
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarClock className="h-4 w-4" />
            </span>
            ReservasIA
          </Link>
          <nav className="flex items-center gap-1">
            <ThemeToggle />
            <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Ingresar
            </Link>
            <Link to="/register" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
              Probar gratis
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Portada */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-16 px-4 pb-24 pt-10 sm:pt-16 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Agente con IA para negocios que agendan citas
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Cada mensaje sin responder es una <span className="text-primary">reserva perdida</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              ReservasIA responde y agenda solo por WhatsApp y Telegram, las 24 horas: atiende a tus clientes, agenda en tus
              horarios reales y les recuerda la cita.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <TrialLink className="w-full sm:w-auto" />
              <InstallAppButton className="h-11 w-full px-6 sm:w-auto" />
            </div>
            <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground lg:justify-start">
              {[
                MONTHLY_PRICE_COP !== null ? `Después, ${formatCop(MONTHLY_PRICE_COP)} al mes` : "Sin tarjeta de crédito",
                "Listo en minutos",
                "En tu mismo WhatsApp"
              ].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <HeroShowcase className="mt-4 lg:mt-0" />
        </section>

        {/* Problema vs. solución */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-4 py-24">
            <Reveal>
              <h2 className="text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Tu negocio, sin perder un solo cliente
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <Reveal className="rounded-3xl border border-border bg-muted/40 p-7">
                <p className="text-sm font-medium text-muted-foreground">Hoy, sin ReservasIA</p>
                <ul className="mt-5 space-y-4">
                  {WITHOUT.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-muted-foreground">
                      <X className="mt-0.5 h-5 w-5 shrink-0 opacity-60" /> {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delayMs={150} className="rounded-3xl border border-primary/40 bg-card p-7 shadow-xl shadow-primary/10">
                <p className="text-sm font-medium text-primary">Con ReservasIA</p>
                <ul className="mt-5 space-y-4">
                  {WITH.map((item) => (
                    <li key={item} className="flex items-start gap-3 font-medium">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Mientras dormís */}
        <section className="bg-foreground text-background">
          <Reveal className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-24 md:grid-cols-[auto,1fr]">
            <div className="text-center md:text-left">
              <Moon className="mx-auto h-8 w-8 opacity-70 md:mx-0" />
              <p className="mt-3 font-display text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl">11:47 p. m.</p>
            </div>
            <div className="text-center md:text-left">
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">Un cliente te escribe a esta hora.</h2>
              <p className="mt-4 text-lg opacity-75">
                Sin ReservasIA, mañana ya reservó en otro lado. Con ReservasIA, ya tiene su cita agendada, confirmada y con
                recordatorio. Y vos, durmiendo.
              </p>
            </div>
          </Reveal>
        </section>

        {/* Funciones */}
        <section>
          <div className="mx-auto w-full max-w-6xl px-4 py-24">
            <Reveal>
              <h2 className="text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">Todo lo que necesitás, nada que no</h2>
            </Reveal>
            <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }, index) => (
                <Reveal key={title} delayMs={(index % 3) * 100}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Cómo empezar */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-24">
            <Reveal>
              <h2 className="text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">Empezás en minutos</h2>
            </Reveal>
            <ol className="mt-14 grid gap-10 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="text-center">
                  <Reveal delayMs={index * 120}>
                    <span className="font-display text-4xl font-semibold text-primary/30">0{index + 1}</span>
                    <h3 className="mt-2 font-medium">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Llamado final */}
        <section className="px-4 pb-24">
          <Reveal className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 animate-blob rounded-full bg-white/10 blur-2xl motion-reduce:animate-none" />
            <h2 className="relative font-display text-3xl font-semibold tracking-tight sm:text-5xl">Tu próxima reserva no debería esperar</h2>
            <p className="relative mx-auto mt-4 max-w-2xl opacity-85">
              Probalo gratis {TRIAL_DAYS} días. Para barberías, peluquerías, spas, consultorios, clínicas, veterinarias, talleres,
              lavaderos, restaurantes, academias, gimnasios y más.
            </p>
            <Link
              to="/register"
              className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "relative mt-8 bg-background text-foreground hover:bg-background/90")}
            >
              Crear mi cuenta gratis
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

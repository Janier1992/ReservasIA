import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  Check,
  Inbox,
  MessageCircle,
  QrCode,
  Send,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { LegalLinks } from "@/pages/legal/LegalLayout";
import { BUSINESS_TYPES } from "@/lib/businessTypes";
import { cn } from "@/lib/utils";

/**
 * Página de presentación pública (la dirección principal del sitio): es lo que
 * encuentra quien busca "ReservasIA" en Google. Quien ya inició sesión va
 * directo a su panel. Todo lo que dice tiene que ser cierto del producto: no
 * se prometen funciones que no existen.
 */

/** Días de prueba gratis al registrarse (igual que public.signup_trial_days() en la base). */
const TRIAL_DAYS = 14;

/**
 * Precio mensual a mostrar, en pesos colombianos. null = todavía no se publica
 * un precio: la tarjeta muestra solo la prueba gratis.
 */
const MONTHLY_PRICE_COP: number | null = null;

const FEATURES: { icon: typeof Sparkles; title: string; text: string }[] = [
  {
    icon: Sparkles,
    title: "Agente con IA que agenda solo",
    text: "Responde a tus clientes, consulta tu disponibilidad real y crea, cambia o cancela reservas, las 24 horas."
  },
  {
    icon: MessageCircle,
    title: "En tu mismo WhatsApp",
    text: "Atiende en tu número de WhatsApp Business y vos seguís usando la app. Si respondés vos, el agente se pausa para no pisarte."
  },
  {
    icon: Send,
    title: "También por Telegram",
    text: "Conectá tu bot de Telegram en un minuto, sin costo por mensaje."
  },
  {
    icon: QrCode,
    title: "Página de reservas y QR",
    text: "Una página pública para reservar desde el celular, con código QR para tu local y aviso por WhatsApp o Telegram."
  },
  {
    icon: BellRing,
    title: "Recordatorios automáticos",
    text: "Tus clientes reciben un recordatorio antes de la cita, por el mismo chat por donde reservaron."
  },
  {
    icon: CalendarDays,
    title: "Google Calendar y correo",
    text: "Cada reserva llega a tu calendario y el cliente recibe la confirmación por correo."
  },
  {
    icon: Inbox,
    title: "Todo en un panel",
    text: "Conversaciones, reservas, clientes, servicios y horarios en un solo lugar, desde el celular o el computador."
  },
  {
    icon: ShieldCheck,
    title: "Datos de tus clientes protegidos",
    text: "Cada negocio ve solo lo suyo, con autorización de datos y borrado de clientes según la Ley 1581."
  }
];

const STEPS = [
  { title: "Creá tu cuenta", text: `Elegí tu rubro y cargá tus servicios y horarios. ${TRIAL_DAYS} días gratis, sin tarjeta.` },
  { title: "Conectá tus canales", text: "WhatsApp Business, Telegram y, si querés, Google Calendar." },
  { title: "Dejá que el agente atienda", text: "Vos revisás todo desde el panel e intervenís cuando quieras." }
];

const formatCop = (value: number) => `$${value.toLocaleString("es-CO")}`;

function Section({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function LandingPage() {
  const { user } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  const sectors = BUSINESS_TYPES.filter((t) => t.value !== "other").map((t) => t.label);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarClock className="h-4 w-4" />
            </span>
            ReservasIA
          </Link>
          <nav className="flex items-center gap-2">
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
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 pt-16 text-center sm:pb-20 sm:pt-24">
          <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Agente de reservas con inteligencia artificial
          </p>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Tu negocio responde y agenda solo, por WhatsApp y Telegram
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            ReservasIA atiende a tus clientes las 24 horas, agenda en tus horarios reales y les recuerda la cita. Vos solo
            atendés.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
              Probar gratis {TRIAL_DAYS} días
            </Link>
            <Link to="/login" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}>
              Ya tengo cuenta
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Sin tarjeta de crédito. Cancelás cuando quieras.</p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">Usala desde el navegador o instalala en tu celular o computador:</p>
            <InstallAppButton />
          </div>
        </section>

        <Section title="Todo lo que necesitás para no perder una reserva" subtitle="Pensado para negocios que agendan citas, turnos o mesas.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </Section>

        <div className="border-y border-border bg-muted/40">
          <Section title="Cómo funciona">
            <ol className="grid gap-6 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 font-medium">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <Section title="Para tu rubro" subtitle="El agente se adapta a cómo trabaja cada tipo de negocio.">
          <ul className="flex flex-wrap justify-center gap-2">
            {sectors.map((label) => (
              <li key={label} className="rounded-full border border-border bg-card px-4 py-1.5 text-sm">
                {label}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="precios" title="Empezá gratis">
          <div className="mx-auto max-w-md rounded-2xl border border-primary/40 bg-card p-6 text-center shadow-sm">
            {MONTHLY_PRICE_COP !== null ? (
              <p className="font-display text-4xl font-semibold">
                {formatCop(MONTHLY_PRICE_COP)}
                <span className="text-base font-normal text-muted-foreground"> / mes</span>
              </p>
            ) : (
              <p className="font-display text-4xl font-semibold">{TRIAL_DAYS} días gratis</p>
            )}
            <ul className="mt-5 space-y-2 text-left text-sm">
              {[
                MONTHLY_PRICE_COP !== null ? `${TRIAL_DAYS} días de prueba gratis` : "Sin tarjeta de crédito",
                "Agente con IA en WhatsApp y Telegram",
                "Página de reservas con QR",
                "Recordatorios automáticos",
                "Panel para todo tu equipo"
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/register" className={cn(buttonVariants({ size: "lg" }), "mt-6 w-full")}>
              Crear mi cuenta
            </Link>
          </div>
        </Section>
      </main>

      <footer className="border-t border-border px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ReservasIA</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

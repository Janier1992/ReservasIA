import { Link, Navigate } from "react-router-dom";
import { BellRing, CalendarClock, CalendarDays, Inbox, MessageCircle, QrCode, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { LegalLinks } from "@/pages/legal/LegalLayout";
import { cn } from "@/lib/utils";
import { AgentChatDemo } from "./AgentChatDemo";

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
 * un precio: solo se muestra la prueba gratis.
 */
const MONTHLY_PRICE_COP: number | null = null;

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

export function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5">
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
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:pt-16 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Tu negocio responde y agenda solo, por WhatsApp y Telegram
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Un agente con inteligencia artificial que atiende a tus clientes las 24 horas, agenda en tus horarios reales y les
              recuerda la cita.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link to="/register" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
                Probar gratis {TRIAL_DAYS} días
              </Link>
              <InstallAppButton className="h-11 w-full px-6 sm:w-auto" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {MONTHLY_PRICE_COP !== null ? `Después, ${formatCop(MONTHLY_PRICE_COP)} al mes. ` : ""}Sin tarjeta de crédito. Usala
              en el navegador o instalala en tu celular.
            </p>
          </div>
          <AgentChatDemo />
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-10 px-4 py-20 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <Icon className="h-5 w-5 text-primary" />
                <h2 className="mt-3 font-medium">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-20">
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">Empezás en minutos</h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="text-center">
                  <span className="font-display text-sm font-semibold text-primary">0{index + 1}</span>
                  <h3 className="mt-2 font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">Probalo gratis {TRIAL_DAYS} días</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Para barberías, peluquerías, spas, consultorios, clínicas, veterinarias, talleres, lavaderos, restaurantes, academias,
              gimnasios y más.
            </p>
            <Link to="/register" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
              Crear mi cuenta
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ReservasIA</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

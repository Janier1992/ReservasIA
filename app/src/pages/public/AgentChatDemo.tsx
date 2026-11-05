import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Animación de la página de presentación: una conversación de WhatsApp en la
 * que el agente agenda una cita. Los mensajes aparecen de a uno, con el
 * "escribiendo…" antes de cada respuesta, y la conversación vuelve a empezar.
 * Hecha con la propia página (sin video): carga al instante y el texto lo
 * lee también Google. Con "reducir movimiento" activado en el dispositivo se
 * muestra entera y quieta.
 */

interface DemoMessage {
  from: "customer" | "agent";
  text: string;
  time: string;
}

// Sin día de la semana a propósito: es una demostración y no puede quedar "equivocada" según el día en que se vea.
const MESSAGES: DemoMessage[] = [
  { from: "customer", text: "Hola, ¿tienen cupo mañana para un corte?", time: "9:41" },
  { from: "agent", text: "¡Hola! Mañana tengo libre a las 10:00 a. m., 11:30 a. m. y 3:00 p. m. ¿Cuál te sirve?", time: "9:41" },
  { from: "customer", text: "A las 10 porfa", time: "9:42" },
  { from: "agent", text: "Listo ✅ Te agendé un corte mañana a las 10:00 a. m. Te recuerdo por acá antes de la cita.", time: "9:42" }
];

const STEP_MS = 1600;
const TYPING_MS = 1100;
const RESTART_MS = 5000;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function AgentChatDemo({ className }: { className?: string }) {
  const [visible, setVisible] = useState(() => (prefersReducedMotion() ? MESSAGES.length : 0));
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    function play() {
      setVisible(0);
      setTyping(false);
      let at = 600;
      MESSAGES.forEach((message, index) => {
        if (message.from === "agent") {
          schedule(() => setTyping(true), at);
          at += TYPING_MS;
        }
        schedule(() => {
          setTyping(false);
          setVisible(index + 1);
        }, at);
        at += STEP_MS;
      });
      schedule(play, at + RESTART_MS);
    }

    play();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      className={cn("mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border border-border bg-card text-card-foreground shadow-xl", className)}
      role="img"
      aria-label="Ejemplo: un cliente pide cupo por WhatsApp y el agente le agenda la cita"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div className="text-left">
          <p className="text-sm font-medium leading-tight">Barbería El Corte</p>
          <p className="text-xs text-muted-foreground">{typing ? "escribiendo…" : "en línea"}</p>
        </div>
      </div>

      <div className="flex h-[22rem] flex-col justify-end gap-2 bg-muted/40 p-4 dark:bg-background">
        {MESSAGES.slice(0, visible).map((message, index) => (
          <div
            key={index}
            className={cn(
              "max-w-[85%] animate-message-in rounded-2xl px-3 py-2 text-left text-sm shadow-sm motion-reduce:animate-none",
              message.from === "customer"
                ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                : "self-start rounded-bl-sm bg-card text-card-foreground dark:bg-muted"
            )}
          >
            {message.text}
            <span className={cn("ml-2 align-bottom text-[10px]", message.from === "customer" ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {message.time}
            </span>
          </div>
        ))}
        {typing && (
          <div className="flex gap-1 self-start rounded-2xl rounded-bl-sm bg-card px-3 py-3 shadow-sm dark:bg-muted" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

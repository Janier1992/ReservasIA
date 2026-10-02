import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Reloj en vivo del local (hora y fecha en la zona horaria del negocio). */
export function LiveClock({ timezone, large }: { timezone: string; large?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const time = now.toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("es-CO", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="text-right" aria-label={`Hora del local: ${time}`}>
      <p className={cn("whitespace-nowrap font-mono font-bold tabular-nums leading-none", large ? "text-4xl" : "text-xl sm:text-2xl")}>{time}</p>
      <p className={cn("mt-1 capitalize text-muted-foreground", large ? "text-sm" : "text-xs")}>{date}</p>
    </div>
  );
}

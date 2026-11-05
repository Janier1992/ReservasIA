import { useEffect, useState } from "react";

/**
 * Cuenta regresiva en segundos (por ejemplo, la espera antes de poder
 * reenviar un código). `start(n)` la arranca; `remaining` llega a 0 al
 * terminar.
 */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return { remaining, start: (seconds: number) => setRemaining(seconds) };
}

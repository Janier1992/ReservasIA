import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Modo pantalla: el elemento ocupa toda la pantalla (para un televisor del
 * local) y se pide que la pantalla no se apague. Se sale con el botón, con
 * Escape o al salir de pantalla completa. Si el navegador no permite
 * pantalla completa, el modo igual se activa (el elemento cubre la ventana).
 */
export function useDisplayMode(ref: RefObject<HTMLElement>) {
  const [display, setDisplay] = useState(false);
  const toggleDisplay = useCallback(() => {
    if (display) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setDisplay(false);
      return;
    }
    setDisplay(true);
    void ref.current?.requestFullscreen?.().catch(() => undefined);
  }, [display, ref]);

  useEffect(() => {
    if (!display) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setDisplay(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDisplay(false);
    };
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    let closed = false;
    nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        // Si ya se salió del modo pantalla mientras se pedía, se suelta de una.
        if (closed) void lock.release().catch(() => undefined);
        else wakeLock = lock;
      })
      .catch(() => undefined);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKey);
      closed = true;
      void wakeLock?.release().catch(() => undefined);
    };
  }, [display]);


  return { display, toggleDisplay };
}

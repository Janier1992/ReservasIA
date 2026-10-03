import { useCallback, useEffect, useState } from "react";

/**
 * Modo pantalla: el tablero ocupa toda la pantalla (para un televisor o una
 * pantalla del local) y se pide que la pantalla no se apague. Se sale con el botón o al
 * salir de pantalla completa (Esc del navegador). Esc dentro de la app no sale:
 * cierra el menú o el diálogo que esté abierto. Si el navegador no permite
 * pantalla completa, el modo igual se activa (el elemento cubre la ventana).
 */
export function useDisplayMode() {
  const [display, setDisplay] = useState(false);
  const toggleDisplay = useCallback(() => {
    if (display) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setDisplay(false);
      return;
    }
    setDisplay(true);
    // Pantalla completa de toda la página (no solo del tablero): los menús,
    // diálogos y avisos se abren fuera del tablero y si no, no se verían. El
    // tablero cubre la ventana con su propio estilo (fixed inset-0).
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, [display]);

  useEffect(() => {
    if (!display) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setDisplay(false);
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
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      closed = true;
      void wakeLock?.release().catch(() => undefined);
    };
  }, [display]);


  return { display, toggleDisplay };
}

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari no soporta display-mode: standalone como media query; expone su propio flag.
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function detectIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
}

/**
 * Chrome/Android exponen `beforeinstallprompt` para poder disparar la
 * instalación desde un botón propio en vez de depender del ícono/heurística
 * automática del navegador (que en Android no siempre aparece, y en
 * desktop puede pasar desapercibida). iOS Safari NUNCA dispara este evento
 * ni tiene una API equivalente: ahí sólo queda mostrar instrucciones para
 * "Compartir → Agregar a pantalla de inicio", es una limitación de Apple,
 * no de esta app.
 */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneDisplay());
  const isIos = detectIos();

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredEvent(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const choice = await deferredEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredEvent(null);
  }

  return {
    installed,
    canPrompt: !!deferredEvent,
    isIos,
    // En iOS no hay evento que disparar, pero igual vale la pena mostrar
    // instrucciones si todavía no está instalada.
    showIosInstructions: isIos && !installed,
    promptInstall
  };
}

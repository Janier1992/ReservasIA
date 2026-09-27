/**
 * Dictado con el reconocimiento de voz del navegador (Chrome/Edge en
 * escritorio y Android, Safari en iPhone). El audio no sale del dispositivo
 * hacia nosotros: el navegador devuelve el texto, y solo el texto se manda a
 * Gemini para convertirlo en campos.
 */

interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return recognitionCtor() !== null;
}

export interface Dictation {
  stop(): void;
  abort(): void;
}

/**
 * Empieza a escuchar. `onText` recibe el texto acumulado (final + parcial) a
 * medida que se habla; `onEnd` el texto final cuando termina (por stop() o
 * porque el usuario dejó de hablar).
 */
export function startDictation(handlers: {
  lang?: string;
  onText: (text: string) => void;
  onEnd: (finalText: string) => void;
  onError: (message: string) => void;
}): Dictation | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = handlers.lang ?? "es-CO";
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = "";
  let aborted = false;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += `${r[0].transcript} `;
      else interim += r[0].transcript;
    }
    handlers.onText(`${finalText}${interim}`.trim());
  };
  rec.onerror = (e) => {
    if (e.error === "aborted" || e.error === "no-speech") return;
    handlers.onError(
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Permití el uso del micrófono en el navegador para dictar."
        : "No se pudo escuchar. Probá de nuevo."
    );
  };
  rec.onend = () => {
    if (!aborted) handlers.onEnd(finalText.trim());
  };
  rec.start();
  return {
    stop: () => rec.stop(),
    abort: () => {
      aborted = true;
      rec.abort();
    }
  };
}

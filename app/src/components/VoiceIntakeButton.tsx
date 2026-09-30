import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FunctionError, functionsClient } from "@/lib/functionsClient";
import { isSpeechSupported, startDictation, type Dictation } from "@/lib/speech";

export interface VoiceFields {
  customer_name: string | null;
  phone: string | null;
  service_id: string | null;
  party_size: number | null;
  notes: string | null;
}

interface Props {
  organizationId: string;
  onResult: (fields: VoiceFields) => void;
}

/**
 * Dictar la llegada de un cliente: el navegador transcribe y Gemini (vía la
 * función voice-intake) convierte el texto en los campos del formulario.
 */
export function VoiceIntakeButton({ organizationId, onResult }: Props) {
  const [state, setState] = useState<"idle" | "listening" | "processing">("idle");
  const [text, setText] = useState("");
  const dictation = useRef<Dictation | null>(null);

  useEffect(() => () => dictation.current?.abort(), []);

  if (!isSpeechSupported()) return null;

  async function process(transcript: string) {
    if (!transcript) {
      setState("idle");
      toast.info("No se escuchó nada. Tocá el micrófono y dictá los datos.");
      return;
    }
    setState("processing");
    try {
      const { fields } = await functionsClient.post<{ fields: VoiceFields }>("voice-intake", {
        organization_id: organizationId,
        transcript
      });
      onResult(fields);
    } catch (err) {
      toast.error(
        err instanceof FunctionError && err.code === "VOICE_NOT_CONFIGURED"
          ? "El dictado por voz todavía no está activado para este negocio."
          : err instanceof Error
            ? err.message
            : "No se pudo procesar el dictado."
      );
    } finally {
      setState("idle");
      setText("");
    }
  }

  function start() {
    setText("");
    dictation.current = startDictation({
      onText: setText,
      onEnd: (finalText) => void process(finalText),
      onError: (message) => {
        toast.error(message);
        setState("idle");
      }
    });
    if (dictation.current) setState("listening");
  }

  return (
    <div className="space-y-2">
      {state === "listening" ? (
        <Button type="button" variant="destructive" onClick={() => dictation.current?.stop()}>
          <Square className="h-4 w-4" /> Listo
        </Button>
      ) : (
        <Button type="button" variant="outline" disabled={state === "processing"} onClick={start}>
          {state === "processing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {state === "processing" ? "Entendiendo…" : "Dictar"}
        </Button>
      )}
      {state === "listening" && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {text || 'Escuchando… ej: "Carlos Ruiz, 300 123 4567, lavado general, placa ABC123"'}
        </p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Send } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { functionsClient } from "@/lib/functionsClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { surveyMessage, surveyUrl, whatsappLink } from "@/lib/engagement";
import type { SurveyRequest } from "@/types/domain";

export interface SurveyTarget {
  reservationId: string;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  conversationId: string | null;
}

interface Props {
  target: SurveyTarget | null;
  organizationId: string;
  businessName: string;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

/** Pide la opinión de una atención completada: crea (o reusa) la encuesta y la comparte por WhatsApp, chat o enlace. */
export function SurveyShareDialog({ target, organizationId, businessName, onOpenChange, onSent }: Props) {
  const [request, setRequest] = useState<SurveyRequest | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) {
      setRequest(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const existing = await insforge.database
        .from("survey_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("reservation_id", target.reservationId)
        .maybeSingle();
      let row = existing.data as SurveyRequest | null;
      if (!row) {
        const created = await insforge.database
          .from("survey_requests")
          .insert([{ organization_id: organizationId, reservation_id: target.reservationId, customer_id: target.customerId }])
          .select("*")
          .single();
        if (created.error) {
          if (!cancelled) {
            toast.error(created.error.message ?? "No se pudo crear la encuesta.");
            onOpenChange(false);
          }
          return;
        }
        row = created.data as SurveyRequest;
      }
      if (cancelled) return;
      setRequest(row);
      setMessage(surveyMessage(target.customerName, businessName, surveyUrl(row.token)));
    })();
    return () => {
      cancelled = true;
    };
  }, [target, organizationId, businessName, onOpenChange]);

  async function markSent(via: "whatsapp_link" | "chat" | "copy") {
    if (!request) return;
    await insforge.database.from("survey_requests").update({ sent_via: via, sent_at: new Date().toISOString() }).eq("id", request.id);
    onSent?.();
  }

  const waLink = target ? whatsappLink(target.phone, message) : null;

  async function sendByChat() {
    if (!target?.conversationId) return;
    setBusy(true);
    try {
      await functionsClient.post("conversations-reply", { organization_id: organizationId, conversation_id: target.conversationId, content: message });
      await markSent("chat");
      toast.success("Encuesta enviada por el chat.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!request) return;
    try {
      await navigator.clipboard.writeText(message);
      await markSent("copy");
      toast.success("Mensaje con el enlace copiado.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedir opinión</DialogTitle>
          <DialogDescription>
            {request?.answered_at
              ? `Ya respondió: ${request.rating} de 5 estrellas.`
              : "El cliente califica de 1 a 5 desde el enlace, sin descargar nada. Si le fue muy bien, se le invita a dejar la reseña en Google."}
          </DialogDescription>
        </DialogHeader>
        {!request ? (
          <p className="text-sm text-muted-foreground">Preparando la encuesta…</p>
        ) : (
          <div className="space-y-3">
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Mensaje" />
            <div className="flex flex-wrap gap-2">
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void markSent("whatsapp_link");
                    onOpenChange(false);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
                </a>
              )}
              {target?.conversationId && (
                <Button size="sm" variant={waLink ? "outline" : "default"} disabled={busy} onClick={sendByChat}>
                  <Send className="h-4 w-4" /> Enviar por el chat
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={copy}>
                <Copy className="h-4 w-4" /> Copiar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

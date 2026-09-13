import { Send, MessageCircle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Step9Integrations({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Conectá tus canales</h2>
        <p className="text-sm text-muted-foreground">
          Podés conectarlos ahora o más tarde desde el dashboard, en "Integraciones".
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-md border border-border p-3">
          <Send className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Telegram (recomendado, gratis)</p>
            <p className="text-xs text-muted-foreground">
              Creá un bot gratis con @BotFather y conectalo para que el agente responda automáticamente, sin costo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-border p-3">
          <MessageCircle className="h-5 w-5 text-success" />
          <div className="flex-1">
            <p className="text-sm font-medium">WhatsApp (Twilio) — opcional, con costo</p>
            <p className="text-xs text-muted-foreground">Conectá tu número para que el agente responda por WhatsApp.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-border p-3">
          <CalendarDays className="h-5 w-5 text-secondary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-muted-foreground">Sincronizá tus reservas automáticamente con tu calendario.</p>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={onNext}>
          Continuar (podés conectarlas después)
        </Button>
      </div>
    </div>
  );
}

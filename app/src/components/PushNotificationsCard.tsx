import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getNotificationPermission,
  hasActivePushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush
} from "@/lib/pushNotifications";

/**
 * Le avisa al dueño/equipo del negocio, con sonido, cuando el agente de IA
 * confirma una reserva nueva por Telegram/WhatsApp — sin tener que tener la
 * app abierta. Requiere permiso explícito del usuario (los navegadores no
 * dejan activarlo solo, tiene que ser un click).
 */
export function PushNotificationsCard({ organizationId }: { organizationId: string }) {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const permission = getNotificationPermission();
  const supported = isPushSupported();

  useEffect(() => {
    hasActivePushSubscription()
      .then(setSubscribed)
      .finally(() => setChecking(false));
  }, []);

  async function handleToggle(next: boolean) {
    if (!user) return;
    setLoading(true);
    try {
      if (next) {
        const ok = await subscribeToPush(organizationId, user.id);
        if (!ok) {
          toast.error("No se pudo activar. Revisá que le hayas dado permiso de notificaciones a este sitio.");
          setLoading(false);
          return;
        }
        toast.success("Notificaciones activadas: te vamos a avisar cuando entre una reserva nueva.");
      } else {
        await unsubscribeFromPush();
        toast.success("Notificaciones desactivadas.");
      }
      setSubscribed(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4" /> Notificaciones push
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Recibí un aviso con sonido en este dispositivo apenas el agente confirme una reserva nueva, sin necesidad
          de tener la app abierta.
        </p>

        {!supported ? (
          <p className="text-sm text-muted-foreground">
            Este navegador o dispositivo no soporta notificaciones push (en iPhone, primero instalá la app desde
            "Compartir → Agregar a pantalla de inicio" y abrila desde ahí).
          </p>
        ) : permission === "denied" ? (
          <p className="text-sm text-destructive">
            Bloqueaste las notificaciones para este sitio. Para activarlas, habilitalas manualmente desde la
            configuración del navegador (ícono de candado junto a la URL → Notificaciones → Permitir) y volvé a
            entrar acá.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <Switch checked={subscribed} disabled={checking || loading} onCheckedChange={handleToggle} />
            <span className="text-sm">{subscribed ? "Activadas en este dispositivo" : "Desactivadas"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
